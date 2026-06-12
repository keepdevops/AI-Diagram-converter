# Bridge image for the `bridge` render module: the committed plantuml.jar runs
# in-container as a PlantUML server (-picoweb) with Graphviz for reference-fidelity
# layout. No separate render service and no external image — reproducible entirely
# from this repo's own jar. Build context is the repo root.
FROM python:3.12-slim

# default-jre-headless runs the jar; graphviz gives real `dot` layout (so
# class/state/component diagrams match plantuml.com, no Smetana fallback).
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-jre-headless graphviz \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 bridge
WORKDIR /app

COPY diagram_agent/ ./diagram_agent/
COPY matrix_client.py ./matrix_client.py
COPY plantuml.jar ./plantuml.jar
COPY docker/bridge-entrypoint.sh /usr/local/bin/bridge-entrypoint.sh
RUN chmod +x /usr/local/bin/bridge-entrypoint.sh

USER bridge

ENV HOST=0.0.0.0 \
    PORT=8770 \
    PYTHONUNBUFFERED=1 \
    RENDER_JAR=1 \
    PICOWEB_PORT=8080 \
    PLANTUML_RENDERER=server \
    RENDER_ENGINE=plantuml-server \
    PLANTUML_SERVER=http://127.0.0.1:8080

EXPOSE 8770 8080

# JVM warmup -> longer start period before health failures count.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8770')+'/api/health',timeout=4).status==200 else 1)"

ENTRYPOINT ["/usr/local/bin/bridge-entrypoint.sh"]
