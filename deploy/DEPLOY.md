# ShopLite — AWS deployment runbook

Target: **https://triops1.duckdns.org**

Everything here uses individual `docker` and `aws` commands. No Compose.

```
Internet :443
   │
   ▼
Host Nginx (TLS via certbot)          ← public: 22 (your IP only), 80, 443
   │ proxy_pass 127.0.0.1:8080
   ▼
frontend container (Nginx)            ← not published publicly
   │ frontend-net + backend-net
   ▼
catalog:3000 · inventory:8081 · order:8082
   │ backend-net (internal, no internet route)
   ▼
postgres:5432 → volume pgdata
```

Region assumed: **ap-south-1**. Instance: **t3.small** (2 vCPU / 2 GB), 20 GB gp3.

---

## 0. Prerequisites

| Requirement | Check |
|---|---|
| Working AWS CLI identity | `aws sts get-caller-identity` → ARN for `user/shoplite-deploy` |
| 4 images pushed to ECR | `aws ecr describe-repositories` |
| Your public IP for the SSH rule | `(Invoke-RestMethod https://checkip.amazonaws.com)` |

If `aws sts get-caller-identity` returns `InvalidClientTokenId`, **stop** — every
step below needs it.

---

## 1. Push the images to ECR (once, from your laptop)

```powershell
$REGION  = "ap-south-1"
$ACCOUNT = (aws sts get-caller-identity --query Account --output text)
$REG     = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

foreach ($s in 'catalog','inventory','order','frontend') {
  aws ecr create-repository --repository-name "shoplite/$s" `
    --image-scanning-configuration scanOnPush=true --region $REGION | Out-Null
}

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REG

docker tag shoplite-catalog:1.0   "$REG/shoplite/catalog:1.0"
docker tag shoplite-inventory:1.0 "$REG/shoplite/inventory:1.0"
docker tag shoplite-order:1.0     "$REG/shoplite/order:1.0"
docker tag shoplite-frontend:1.1  "$REG/shoplite/frontend:1.1"

docker push "$REG/shoplite/catalog:1.0"
docker push "$REG/shoplite/inventory:1.0"
docker push "$REG/shoplite/order:1.0"
docker push "$REG/shoplite/frontend:1.1"
```

Verify (should list the tag for each repo):

```powershell
foreach ($s in 'catalog','inventory','order','frontend') {
  aws ecr describe-images --repository-name "shoplite/$s" `
    --query "imageDetails[].imageTags" --output text
}
```

---

## 2. AWS objects

### 2.1 Key pair (never leaves your machine)

```powershell
aws ec2 create-key-pair --key-name shoplite-key --query KeyMaterial --output text `
  | Out-File -Encoding ascii -NoNewline "$HOME\.ssh\shoplite-key.pem"
icacls "$HOME\.ssh\shoplite-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

The private key is written by AWS once. Nobody — including me — needs to see it.

### 2.2 Security group (least privilege)

```powershell
$MYIP = (Invoke-RestMethod https://checkip.amazonaws.com).Trim()
$SG = (aws ec2 create-security-group --group-name shoplite-sg `
        --description "ShopLite public web + admin SSH" `
        --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions `
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32,Description='admin ssh'}]" | Out-Null
aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions `
  "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description='http'}]" | Out-Null
aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions `
  "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description='https'}]" | Out-Null
```

**Do not add 5432, 8081, 8082 or 3000.** Those only exist inside Docker networks.
Outbound stays at the default "allow all", which is what lets the server pull
packages and resolve DNS.

### 2.3 Instance role so the server can pull from ECR without a stored password

```powershell
aws iam create-role --role-name shoplite-ecr-read `
  --assume-role-policy-document file://deploy/ec2-trust.json | Out-Null
aws iam attach-role-policy --role-name shoplite-ecr-read `
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam create-instance-profile --instance-profile-name shoplite-ecr-read | Out-Null
aws iam add-role-to-instance-profile --instance-profile-name shoplite-ecr-read `
  --role-name shoplite-ecr-read
```

Read-only on ECR is enough on the server: it only ever pulls.

### 2.4 Instance (Ubuntu 24.04, current AMI)

```powershell
$AMI = (aws ssm get-parameter `
  --name "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id" `
  --query Parameter.Value --output text)

$INSTANCE = (aws ec2 run-instances `
  --image-id $AMI --instance-type t3.small --key-name shoplite-key `
  --security-group-ids $SG --iam-instance-profile Name=shoplite-ecr-read `
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}' `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=shoplite}]' `
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --instance-ids $INSTANCE
aws ec2 describe-instances --instance-ids $INSTANCE `
  --query 'Reservations[0].Instances[0].{Id:InstanceId,IP:PublicIpAddress,State:State.Name}' --output table
```

### 2.5 Elastic IP (survives stop/start — otherwise the IP changes and DNS breaks)

```powershell
$ALLOC = (aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $INSTANCE --allocation-id $ALLOC
aws ec2 describe-addresses --query 'Addresses[0].PublicIp' --output text
```

---

## 3. Point DuckDNS at the server

DuckDNS dashboard → set the IP to the Elastic IP. TTL is 60 s.

```powershell
Resolve-DnsName triops1.duckdns.org -Type A | Select-Object IPAddress
```

Do **not** run certbot until this returns the Elastic IP — Let's Encrypt validates
by fetching a file over the public internet, and it will follow DNS wherever it
currently points.

Automate the update so the record never goes stale (token stays on the server):

```bash
sudo install -d -m 700 /opt/shoplite
echo 'YOUR_DUCKDNS_TOKEN' | sudo tee /opt/shoplite/duckdns.token >/dev/null
sudo chmod 600 /opt/shoplite/duckdns.token
sudo tee /usr/local/bin/duckdns-update >/dev/null <<'EOF'
#!/bin/sh
curl -fsS "https://www.duckdns.org/update?domains=triops1&token=$(cat /opt/shoplite/duckdns.token)&ip=" >/dev/null 2>&1
EOF
sudo chmod 755 /usr/local/bin/duckdns-update
( crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/duckdns-update" ) | crontab -
```

---

## 4. Prepare the server

```bash
ssh -i ~/.ssh/shoplite-key.pem ubuntu@triops1.duckdns.org

sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y ca-certificates curl gnupg unzip jq nginx awscli

# Official Docker installation (download.docker.com, not the snap)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

# Run docker without sudo (log out and back in afterwards)
sudo usermod -aG docker "$USER"

# Host firewall: 22 admin, 80/443 public. UFW adds a second layer behind the
# security group; both must allow the traffic.
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable

free -h && df -h / && docker --version
```

### Environment files (never committed)

```bash
sudo mkdir -p /opt/shoplite && cd /opt/shoplite
sudo nano .env.db      # paste deploy/env.db.example, fill in the password
sudo nano .env.app     # paste deploy/env.app.example, same password
sudo chmod 600 .env.db .env.app
sudo chown root:root .env.db .env.app

# Generate a password instead of inventing one:
openssl rand -base64 24
```

Two files, not one, because a single shared `--env-file` hands
`POSTGRES_PASSWORD` to catalog, inventory and order as well. They never need it.

---

## 5. Pull and run the containers

```bash
REGION=ap-south-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REG="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REG"

docker pull "$REG/shoplite/catalog:1.0"
docker pull "$REG/shoplite/inventory:1.0"
docker pull "$REG/shoplite/order:1.0"
docker pull "$REG/shoplite/frontend:1.1"

docker network create --internal backend-net
docker network create frontend-net
docker volume create pgdata

# 1. Database first — everything else needs it.
docker run -d --name postgres --network backend-net \
  --restart unless-stopped --env-file /opt/shoplite/.env.db \
  -v pgdata:/var/lib/postgresql/data postgres:17-alpine

docker exec postgres pg_isready -U shop -d shopdb    # wait for "accepting connections"

# 2. Backends — no published ports at all.
docker run -d --name catalog  --network backend-net --restart unless-stopped \
  --env-file /opt/shoplite/.env.app "$REG/shoplite/catalog:1.0"
docker run -d --name inventory --network backend-net --restart unless-stopped \
  --env-file /opt/shoplite/.env.app "$REG/shoplite/inventory:1.0"
docker run -d --name order    --network backend-net --restart unless-stopped \
  --env-file /opt/shoplite/.env.app "$REG/shoplite/order:1.0"

# 3. Frontend — bound to loopback only, so it cannot be reached directly.
docker run -d --name frontend --network frontend-net --restart unless-stopped \
  -p 127.0.0.1:8080:80 "$REG/shoplite/frontend:1.1"
docker network connect backend-net frontend
```

`127.0.0.1:8080:80` is the important part: `-p 8080:80` would publish to
`0.0.0.0`, exposing the container to the internet and bypassing Nginx/TLS.

### Database initialisation

Only on a **fresh** volume, load the schema:

```bash
scp -i ~/.ssh/shoplite-key.pem db/init.sql ubuntu@triops1.duckdns.org:/tmp/init.sql
docker exec -i postgres psql -U shop -d shopdb < /tmp/init.sql
```

On a volume that already has data, **do not** replay `init.sql` — it will
conflict with existing rows.

---

## 6. Nginx + TLS

```bash
sudo cp /etc/nginx/sites-available/default /root/default.backup.$(date +%F)
sudo nano /etc/nginx/sites-available/shoplite   # paste deploy/nginx-trios1.conf
sudo ln -sf /etc/nginx/sites-available/shoplite /etc/nginx/sites-enabled/shoplite
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Prove the proxy works before requesting a certificate
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: triops1.duckdns.org' http://127.0.0.1/
```

Then certificates:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d triops1.duckdns.org
```

Certbot edits the config: adds `listen 443 ssl`, the certificate paths, and the
HTTP→HTTPS redirect. Check renewal actually works — this is the step people skip:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## 7. Verify

```bash
bash <(curl -s https://raw.githubusercontent.com/ahmadullah11/triops2/main/deploy/verify.sh)
# or copy deploy/verify.sh to the server and:  bash verify.sh
```

Expected: all containers running, `200` from every health endpoint, `200` over
HTTPS, `301` for plain HTTP, certificate dates printed, and only
22/80/443 listening publicly.

Restart behaviour (this is what restart policies are for):

```bash
docker kill order          # simulate a crash
sleep 10 && docker ps --filter name=order    # back up automatically
sudo reboot                # simulate a host restart
# after ~60s: ssh in, docker ps → all five containers up, data intact
```

---

## 8. Backup and restore

```bash
# Dump (custom format, compressed)
docker exec postgres pg_dump -U shop -d shopdb -Fc > ~/shopdb-$(date +%F).dump

# Restore into a FRESH database — never overwrite live data
docker exec -i postgres createdb -U shop shopdb_restore
docker exec -i postgres pg_restore -U shop -d shopdb_restore < ~/shopdb-YYYY-MM-DD.dump
```

The volume `pgdata` survives container deletion. It does **not** survive
`docker volume rm pgdata` or an instance termination with
`DeleteOnTermination=true` on the *volume* (separate from the root disk).
Keep off-server dumps (`scp` them to your laptop or S3) — a backup that only
exists on the machine it protects is not a backup.

---

## 9. Teardown (when you want to stop paying)

```bash
# stop the stack but keep data
docker stop frontend order inventory catalog postgres
```

```powershell
# stop billing entirely (data on the volume is destroyed — dump first!)
aws ec2 terminate-instances --instance-ids $INSTANCE
aws ec2 release-address --allocation-id $ALLOC
```

Order matters: dump → verify the dump → terminate.
