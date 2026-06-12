# Diagram-agent bridge: stdlib-only Python, no pip dependencies.
# Build context is the repo root (needs diagram_agent/ and matrix_client.py).
FROM python:3.12-slim

# Run as a non-root user.
RUN useradd --create-home --uid 10001 bridge
WORKDIR /app

# Only the bridge's own source — no jar, no node_modules (see .dockerignore).
COPY diagram_agent/ ./diagram_agent/
COPY matrix_client.py ./matrix_client.py

USER bridge

# Bind all interfaces inside the container; compose/env override the rest.
ENV HOST=0.0.0.0 \
    PORT=8770 \
    PYTHONUNBUFFERED=1

EXPOSE 8770

# Stdlib health probe (no curl in slim image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,os,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8770')+'/api/health',timeout=4).status==200 else 1)"

CMD ["python", "-m", "diagram_agent.server"]
