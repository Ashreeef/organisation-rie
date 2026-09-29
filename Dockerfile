# ==============================================================================
# Dockerfile — Base environment specification for Domino Data Lab
#
# Builds an Ubuntu 22.04 / Python 3.11 / Node.js 20 environment with all ML
# and frontend dependencies pre-installed for fast Domino app initialization.
# ==============================================================================

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production

# 1. System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    curl \
    git \
    build-essential \
    libgomp1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set python3.11 as default python
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# 2. Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3. Install Python dependencies
COPY requirements.txt /app/
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir -r requirements.txt

# 4. Copy project files
COPY . /app/

# 5. Build Next.js Dashboard
WORKDIR /app/dashboard
RUN npm ci --production=false \
    && npm run build \
    && npm prune --production

WORKDIR /app

# Ensure shell scripts have execution rights
RUN chmod +x /app/app.sh

EXPOSE 8888 8000

ENTRYPOINT ["/app/app.sh"]
