# Worktime Backend - Dockerfile
# Base image: Python 3.11-slim for optimal size and compatibility

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (if needed in future)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create data directory for local development
# Note: In production, mount share directory as a volume at /app/data/hday_files
# Example: docker run -v /path/to/share:/app/data/hday_files worktime-backend
RUN mkdir -p /app/data/hday_files

# Environment variable defaults (can be overridden at runtime)
ENV ENVIRONMENT=production
ENV HOST=0.0.0.0
ENV PORT=8000
ENV SHARE_DIR=/app/data/hday_files
ENV CORS_ORIGINS=http://localhost:5173
ENV CACHE_ENABLED=true
ENV CACHE_TTL=10

# Expose port
EXPOSE 8000

# Health check (optional but recommended for container orchestration)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

# Run application with Uvicorn
# Use exec form to ensure proper signal handling
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
