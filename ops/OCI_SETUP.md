# OCI Setup Guide — Hubforte Production Deployment

> **Cloud-agnostic guarantee:** Every step below uses standard Linux, Docker, and
> nginx. Nothing here is OCI-specific. See the [Alternative Clouds](#alternative-clouds)
> section to deploy to Railway, Render, or Fly.io instead.
>
> **Quarterly check:** Can this be deployed to Railway in under 30 minutes? Yes — see below.

---

## Prerequisites

- An OCI Compute instance (Ubuntu 22.04 LTS, minimum 2 vCPU / 4 GB RAM)
- A domain name with DNS pointing to the server's public IP
- SSH access to the server
- A GitHub repository with the Hubforte codebase
- GitHub Actions enabled on the repository

---

## Step 1 — Provision the Server

1. Create an OCI Compute instance:
   - Shape: VM.Standard.E4.Flex (2 OCPU, 4 GB RAM) or equivalent
   - Image: Canonical Ubuntu 22.04
   - Add your SSH public key during provisioning

2. Open firewall ports in the OCI Security List:
   - TCP 22 (SSH)
   - TCP 80 (HTTP)
   - TCP 443 (HTTPS)

3. SSH into the server:
   ```bash
   ssh ubuntu@<YOUR_SERVER_IP>
   ```

---

## Step 2 — Install Docker & Docker Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow your user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker --version
docker compose version
```

---

## Step 3 — Create the App Directory

```bash
sudo mkdir -p /opt/hubforte
sudo chown $USER:$USER /opt/hubforte
cd /opt/hubforte
```

Copy `docker-compose.prod.yml` from the repository to `/opt/hubforte/`:
```bash
# Option A: clone the repo (then copy the file)
git clone https://github.com/<YOUR_ORG>/<YOUR_REPO>.git /tmp/hubforte
cp /tmp/hubforte/docker-compose.prod.yml /opt/hubforte/

# Option B: download directly
curl -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/<YOUR_ORG>/<YOUR_REPO>/main/docker-compose.prod.yml
```

---

## Step 4 — Configure Environment Variables

Create `/opt/hubforte/.env.prod` from `.env.production.example` in the repo:

```bash
cp /tmp/hubforte/.env.production.example /opt/hubforte/.env.prod
nano /opt/hubforte/.env.prod   # fill in every value
```

**Never commit `.env.prod` to git.** The GitHub Actions deploy workflow writes this
file from the `PROD_ENV` GitHub Secret (see Step 6).

---

## Step 5 — Install nginx & Certbot (Reverse Proxy + SSL)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/hubforte`:

```nginx
# API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# CRM frontend
server {
    listen 80;
    server_name crm.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# LMS frontend
server {
    listen 80;
    server_name lms.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/hubforte /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Obtain SSL certificates:
```bash
sudo certbot --nginx \
  -d api.yourdomain.com \
  -d crm.yourdomain.com \
  -d lms.yourdomain.com \
  --non-interactive --agree-tos -m ops@yourdomain.com
```

Certbot auto-renews via a systemd timer — verify with:
```bash
sudo systemctl status certbot.timer
```

---

## Step 6 — Configure GitHub Actions Secrets

In your GitHub repository → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | Your server's public IP or hostname |
| `DEPLOY_USER` | SSH username (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private SSH key (the key whose public half is on the server) |
| `VITE_API_URL` | `https://api.yourdomain.com` |
| `VITE_LMS_URL` | `https://lms.yourdomain.com` |
| `PROD_ENV` | Full contents of your filled-in `.env.prod` file |

The `PROD_ENV` secret is written to `/opt/hubforte/.env.prod` on each deploy by the
workflow. This means you never need to SSH in to update env vars — just update the
secret and re-run the workflow.

---

## Step 7 — First Manual Deploy

Before GitHub Actions takes over, do a manual first deploy to verify everything works:

```bash
cd /opt/hubforte

# Log in to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin

# Set required env vars
export GITHUB_REPOSITORY=<YOUR_ORG>/<YOUR_REPO>
export IMAGE_TAG=latest

# Pull and start
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api --tail=50
```

Verify the API is healthy:
```bash
curl https://api.yourdomain.com/api/healthz
```

---

## Step 8 — Run Database Migrations

Migrations must be run once after first deploy and after any schema change:

```bash
# SSH into the server
ssh ubuntu@<YOUR_SERVER_IP>

# Migrations are plain SQL files — apply them with psql directly.
# Replace XXXX_description with the migration filename(s) you need to apply.
psql $DATABASE_URL -f lib/db/migrations/XXXX_description_up.sql

# Or run from your local machine with DATABASE_URL exported:
# export DATABASE_URL=postgresql://...
# psql $DATABASE_URL -f lib/db/migrations/XXXX_description_up.sql
```

---

## Step 9 — Ongoing Deploys

After Step 6 is configured, every push to `main` triggers the GitHub Actions workflow
automatically:

1. Builds all 4 Docker images
2. Pushes them to GHCR with the commit SHA as the tag
3. SSHs into the server, pulls the new images, and restarts containers

Monitor deploys in the GitHub Actions tab of your repository.

---

## Maintenance

### View logs
```bash
docker compose -f /opt/hubforte/docker-compose.prod.yml logs -f api
docker compose -f /opt/hubforte/docker-compose.prod.yml logs -f worker
```

### Restart a service
```bash
docker compose -f /opt/hubforte/docker-compose.prod.yml restart api
```

### Update env vars
1. Update the `PROD_ENV` GitHub Secret
2. Re-run the deploy workflow (Actions → Run workflow)

---

## Alternative Clouds

The Dockerfiles and compose files work on any cloud. Only the deploy target changes.

### Railway (recommended for simplicity)

1. Push the repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add each service (`api`, `crm`, `lms`, `worker`) as a separate Railway service
4. Set environment variables in the Railway dashboard (same vars as `.env.production.example`)
5. Railway handles SSL, domains, and rolling deploys automatically

**Time to deploy: under 15 minutes.**

### Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Set the Dockerfile path for each service
4. Add environment variables in the Render dashboard
5. Render provides free SSL and auto-deploys on push

**Time to deploy: under 20 minutes.**

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy API
cd artifacts/api-server
fly launch --dockerfile Dockerfile --name hubforte-api
fly secrets set DATABASE_URL="..." JWT_SECRET="..." # etc.
fly deploy

# Repeat for crm, lms, worker
```

**Time to deploy: under 30 minutes.**

### DigitalOcean App Platform

1. Go to DigitalOcean → App Platform → Create App
2. Connect GitHub repo
3. Configure each component with its Dockerfile path
4. Set environment variables in the App Platform UI
5. DigitalOcean handles SSL and scaling

---

## Quarterly Cloud-Agnostic Check

> Can this be deployed to Railway in under 30 minutes?

Checklist:
- [ ] All env vars are in `.env.production.example` with descriptions
- [ ] No OCI-specific APIs in any Dockerfile or compose file
- [ ] All services start with only environment variables (no file-based secrets)
- [ ] Health checks work on all services
- [ ] Database is external (Neon) — no data migration needed to switch clouds
