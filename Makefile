#
# FlowLog Playground Server — automation
#
# First-time setup on a fresh CloudLab node:
#   make            # clone + build flowlog (incl. the profile visualizer),
#                   # start backend + tunnel detached, then print the HTTPS URL
#                   # to use in playground.js
#
# Day-to-day:
#   make start      # same as 'make' (idempotent — skips already-running services)
#   make stop       # kill backend + cloudflared
#   make status     # show what's running
#   make url        # print the current trycloudflare.com URL
#   make logs       # tail backend + cloudflared logs
#   make update     # git-pull both repos, rebuild, then restart
#   make help       # full target list
#
# Services run via `nohup &` so they survive SSH disconnect — no tmux needed.
#

SHELL := /bin/bash

# --- flowlog (external) ---------------------------------------------------
FLOWLOG_REPO     ?= https://github.com/flowlog-rs/flowlog
FLOWLOG_BRANCH   ?= main
FLOWLOG_DIR      ?= $(HOME)/flowlog
FLOWLOG_BIN      := $(FLOWLOG_DIR)/target/release/flowlog-compiler
ENV_MARKER       := $(FLOWLOG_DIR)/.env-done
CARGO_ENV        := $(HOME)/.cargo/env

# --- profile visualizer ---------------------------------------------------
# Turns a profiled run's `program_log/` tree into a self-contained HTML report.
PROFILE_VIZ_BIN    := $(FLOWLOG_DIR)/target/release/flowlog-visualizer

# --- this repo ------------------------------------------------------------
SERVER_DIR       := $(CURDIR)/server
SERVER_BIN       := $(SERVER_DIR)/target/release/flowlog-playground-server
# The playground's hardcoded backend URL. `make start` rewrites the
# DEFAULT_SERVER line here to the fresh tunnel URL; you commit + push to deploy.
PLAYGROUND_JS    := $(CURDIR)/src/pages/playground.js

# --- cloudflared (HTTPS tunnel) -------------------------------------------
CLOUDFLARED_BIN  := $(HOME)/bin/cloudflared
CLOUDFLARED_URL  := https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# Named (persistent) tunnel vs. ephemeral quick tunnel.
#   TUNNEL_NAME empty  → quick tunnel: random https://<...>.trycloudflare.com,
#                        changes on every restart (needs no Cloudflare account).
#   TUNNEL_NAME set    → named tunnel: fixed https://$(TUNNEL_HOSTNAME), stable
#                        across restarts. One-time setup: `make tunnel-setup`.
# Flip to named mode either here or per-invocation: `make start TUNNEL_NAME=flowlog-playground`.
TUNNEL_NAME      ?=
TUNNEL_HOSTNAME  ?= playground.flowlog-rs.com

# --- runtime knobs (override on the command line) -------------------------
PORT             ?= 8080
BIND_ADDR        ?= 0.0.0.0:$(PORT)
ALLOWED_ORIGINS  ?= *
# Server-side datasets (the Doop/Tomcat demo lives here). Longer run timeout so
# heavier whole-program analyses finish instead of hitting the default 30s cap.
DATASETS_DIR     ?= $(SERVER_DIR)/datasets
RUN_TIMEOUT_SECS ?= 120

# --- local dev knobs (for `make local`) -----------------------------------
LOCAL_PORT       ?= 8088
LOCAL_WEB_PORT   ?= 3000

# --- runtime state (pid files + logs live here) ---------------------------
RUN_DIR          := $(CURDIR)/.run
BACKEND_PID      := $(RUN_DIR)/backend.pid
CLOUDFLARED_PID  := $(RUN_DIR)/cloudflared.pid
BACKEND_LOG      := $(RUN_DIR)/backend.log
CLOUDFLARED_LOG  := $(RUN_DIR)/cloudflared.log

# Regex for the public HTTPS URL cloudflared writes to its log.
TUNNEL_URL_RE    := https://[a-z0-9-]+\.trycloudflare\.com

.DEFAULT_GOAL := all

.PHONY: help all setup env flowlog profile-viz server cloudflared \
        start stop status url logs run tunnel tunnel-setup local \
        monitor monitor-install monitor-uninstall \
        update clean clean-flowlog dataset-tomcat doop

# Regenerate the playground's Doop program module (src/doopProgram.js) from the
# editable src/doop.dl. Run after editing the program.
doop:
	@bash scripts/gen-doop.sh

# --- large datasets (fetched, not committed) ------------------------------
TOMCAT_DIR  := $(DATASETS_DIR)/tomcat
TOMCAT_URL  ?= https://huggingface.co/datasets/NemoYuu/flowlog_benchmark/resolve/main/dataset/csv/tomcat.zip
# Only the .facts inputs that doop.dl actually reads (keeps it ~389MB, not 582).
TOMCAT_FACTS := ActualParam ApplicationClass ArrayType AssignCast AssignHeapAllocation \
  AssignLocal AssignReturnValue ClassType ComponentType DirectSuperclass DirectSuperinterface \
  Field FormalParam InterfaceType LoadArrayIndex LoadInstanceField LoadStaticField MainClass \
  Method Method-Modifier NormalHeap Return SpecialMethodInvocation StaticMethodInvocation \
  StoreArrayIndex StoreInstanceField StoreStaticField StringConstant ThisVar Var-DeclaringMethod \
  Var-Type VirtualMethodInvocation

help:
	@echo 'FlowLog Playground Server — make targets:'
	@echo ''
	@echo 'Service control (detached; survives terminal shutdown):'
	@echo '  make / make all      build everything, start detached, print URL'
	@echo '  make start           same as above (idempotent)'
	@echo '  make stop            kill backend + cloudflared'
	@echo '  make status          show what is running'
	@echo '  make url             print the current trycloudflare.com URL'
	@echo '  make logs            tail -f backend + cloudflared logs'
	@echo '  make tunnel-setup    one-time steps for a persistent named tunnel URL'
	@echo ''
	@echo 'Uptime monitoring (armed automatically by make start):'
	@echo '  make monitor         run one health check now (prints UP/DOWN)'
	@echo '  make monitor-install install the every-5-min cron watchdog'
	@echo '  make monitor-uninstall  remove the cron watchdog'
	@echo '                       (add a ping URL for email alerts; see monitor-install)'
	@echo ''
	@echo 'Build / setup:'
	@echo '  make setup           build everything, do not start anything'
	@echo '  make env             only run flowlog env/env.sh (one-time)'
	@echo '  make flowlog         only build flowlog-compiler'
	@echo '  make profile-viz     only build flowlog-visualizer'
	@echo '  make server          only build the playground server'
	@echo '  make cloudflared     only download cloudflared'
	@echo '  make dataset-tomcat  fetch the Doop/Tomcat dataset (~389MB, not in git)'
	@echo '  make update          git-pull + rebuild'
	@echo '  make clean           remove server/target'
	@echo '  make clean-flowlog   wipe the flowlog checkout entirely'
	@echo ''
	@echo 'Foreground (debugging):'
	@echo '  make run             backend only, foreground'
	@echo '  make tunnel          backend + cloudflared, foreground (Ctrl+C stops both)'
	@echo '  make local           backend + Docusaurus dev server for local testing'
	@echo '                       (open the printed URL; Ctrl+C stops both)'
	@echo ''
	@echo 'Override variables, e.g.:'
	@echo '  make start PORT=9000'
	@echo '  make start ALLOWED_ORIGINS="https://flowlog-rs.github.io,http://localhost:3001"'

all: start

setup: $(FLOWLOG_BIN) $(PROFILE_VIZ_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN) $(TOMCAT_DIR)/MainClass.facts

env: $(ENV_MARKER)
flowlog: $(FLOWLOG_BIN)
profile-viz: $(PROFILE_VIZ_BIN)
server: $(SERVER_BIN)
cloudflared: $(CLOUDFLARED_BIN)

# 1. Clone flowlog (main branch by default).
$(FLOWLOG_DIR):
	@echo '==> cloning $(FLOWLOG_REPO) ($(FLOWLOG_BRANCH)) → $(FLOWLOG_DIR)'
	git clone --branch $(FLOWLOG_BRANCH) $(FLOWLOG_REPO) $(FLOWLOG_DIR)

# 2. Run env/env.sh once. Installs rustup + OS packages (may prompt for sudo).
$(ENV_MARKER): | $(FLOWLOG_DIR)
	@echo '==> running env/env.sh (one-time setup; may prompt for sudo)'
	cd $(FLOWLOG_DIR) && bash env/env.sh
	@touch $@

# 3. Build flowlog-compiler.
$(FLOWLOG_BIN): | $(ENV_MARKER)
	@echo '==> building flowlog-compiler (release)'
	@bash -c 'source $(CARGO_ENV) 2>/dev/null || true; cd $(FLOWLOG_DIR) && cargo build --release'

# 3b. The visualizer is a flowlog workspace member, so the build above produces
#     it alongside flowlog-compiler.
$(PROFILE_VIZ_BIN): $(FLOWLOG_BIN)
	@:

# 4. Build the playground server. Independent of the compiler/visualizer at
#    build time (only needed at runtime), so `make -j` can build in parallel.
$(SERVER_BIN):
	@echo '==> building playground server (release)'
	@bash -c 'source $(CARGO_ENV) 2>/dev/null || true; cd $(SERVER_DIR) && cargo build --release'

# 5. Download cloudflared (static binary, no install needed).
$(CLOUDFLARED_BIN):
	@echo '==> downloading cloudflared → $(CLOUDFLARED_BIN)'
	@mkdir -p $(dir $(CLOUDFLARED_BIN))
	curl -fSL --output $(CLOUDFLARED_BIN) $(CLOUDFLARED_URL)
	chmod +x $(CLOUDFLARED_BIN)

# 6. Fetch the Doop/Tomcat dataset (~389MB of .facts). Too large to commit, so
#    it's downloaded from HuggingFace and only the inputs doop.dl reads are
#    kept. Idempotent: skips if the dataset already looks complete.
dataset-tomcat: $(TOMCAT_DIR)/MainClass.facts
$(TOMCAT_DIR)/MainClass.facts:
	@echo '==> fetching Doop/Tomcat dataset → $(TOMCAT_DIR)'
	@mkdir -p $(TOMCAT_DIR)
	@tmp=$$(mktemp -d); \
	  echo '    downloading tomcat.zip (~37MB)...'; \
	  curl -fSL --output $$tmp/tomcat.zip $(TOMCAT_URL); \
	  echo '    extracting $(words $(TOMCAT_FACTS)) input files...'; \
	  for f in $(TOMCAT_FACTS); do \
	    unzip -o -j $$tmp/tomcat.zip "tomcat/$$f.facts" -d $(TOMCAT_DIR) >/dev/null; \
	  done; \
	  rm -rf $$tmp; \
	  cp $(FLOWLOG_DIR)/example/program_analysis/doop.dl $(TOMCAT_DIR)/doop.dl 2>/dev/null || true; \
	  echo "    done — $$(du -sh $(TOMCAT_DIR) | cut -f1) in $(TOMCAT_DIR)"

# ─── Detached service control ───────────────────────────────────────────────

# Start backend + cloudflared in the background (idempotent: skips anything
# already running) and print the HTTPS URL when the tunnel comes up.
start: $(FLOWLOG_BIN) $(PROFILE_VIZ_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN) $(TOMCAT_DIR)/MainClass.facts
	@mkdir -p $(RUN_DIR)
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
	  echo "==> backend already running (pid $$(cat $(BACKEND_PID)))"; \
	else \
	  echo '==> starting backend (detached)  log: $(BACKEND_LOG)'; \
	  nohup bash -c 'source $(CARGO_ENV) 2>/dev/null || true; \
	    FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	    FLOWLOG_PROFILE_VIZ=$(PROFILE_VIZ_BIN) \
	    DATASETS_DIR=$(DATASETS_DIR) \
	    RUN_TIMEOUT_SECS=$(RUN_TIMEOUT_SECS) \
	    BIND_ADDR=$(BIND_ADDR) \
	    ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)" \
	    exec $(SERVER_BIN)' >$(BACKEND_LOG) 2>&1 & \
	  echo $$! > $(BACKEND_PID); \
	  sleep 1; \
	  if ! kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
	    echo 'backend failed to start; see $(BACKEND_LOG):'; \
	    tail -20 $(BACKEND_LOG); rm -f $(BACKEND_PID); exit 1; \
	  fi; \
	fi
	@if [ -f $(CLOUDFLARED_PID) ] && kill -0 $$(cat $(CLOUDFLARED_PID)) 2>/dev/null; then \
	  echo "==> cloudflared already running (pid $$(cat $(CLOUDFLARED_PID)))"; \
	else \
	  : > $(CLOUDFLARED_LOG); \
	  if [ -n "$(TUNNEL_NAME)" ]; then \
	    echo '==> starting cloudflared named tunnel "$(TUNNEL_NAME)" → $(TUNNEL_HOSTNAME) (detached)  log: $(CLOUDFLARED_LOG)'; \
	    nohup $(CLOUDFLARED_BIN) tunnel --no-autoupdate run --url http://localhost:$(PORT) $(TUNNEL_NAME) \
	      >$(CLOUDFLARED_LOG) 2>&1 & \
	  else \
	    echo '==> starting cloudflared quick tunnel (detached)  log: $(CLOUDFLARED_LOG)'; \
	    nohup $(CLOUDFLARED_BIN) tunnel --no-autoupdate --url http://localhost:$(PORT) \
	      >$(CLOUDFLARED_LOG) 2>&1 & \
	  fi; \
	  echo $$! > $(CLOUDFLARED_PID); \
	fi
	@echo '==> waiting for tunnel URL...'
	@for i in $$(seq 1 30); do \
	  if [ -n "$(TUNNEL_NAME)" ]; then \
	    if grep -qE 'Registered tunnel connection|Connection [0-9a-f-]+ registered' $(CLOUDFLARED_LOG) 2>/dev/null; then \
	      URL="https://$(TUNNEL_HOSTNAME)"; else URL=""; fi; \
	  else \
	    URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	  fi; \
	  if [ -n "$$URL" ]; then \
	    msg="  HTTPS URL:  $$URL  "; \
	    bar=$$(printf '─%.0s' $$(seq 1 $${#msg})); \
	    echo; \
	    echo "  ┌$$bar┐"; \
	    echo "  │$$msg│"; \
	    echo "  └$$bar┘"; \
	    echo; \
	    if [ -f $(PLAYGROUND_JS) ]; then \
	      old=$$(sed -n "s|^const DEFAULT_SERVER = '\(.*\)';.*|\1|p" $(PLAYGROUND_JS) | head -1); \
	      if [ "$$old" = "$$URL" ]; then \
	        echo "  src/pages/playground.js already points here — no change."; \
	      else \
	        sed -i "s|^const DEFAULT_SERVER = .*|const DEFAULT_SERVER = '$$URL';|" $(PLAYGROUND_JS); \
	        echo "  ✓ updated src/pages/playground.js DEFAULT_SERVER  (was: $${old:-unset})"; \
	        echo "    commit + push to deploy the live site (Pages builds on push to main):"; \
	        echo "      git commit -am 'playground: point at new tunnel URL' && git push"; \
	      fi; \
	    else \
	      echo "  (src/pages/playground.js not found — set DEFAULT_SERVER = '$$URL' manually)"; \
	    fi; \
	    echo; \
	    if [ "$(MONITOR_AUTO)" = "1" ]; then \
	      if [ -n "$(HC_PING_URL)" ]; then printf '%s\n' '$(HC_PING_URL)' > $(RUN_DIR)/hc-ping-url; fi; \
	      if ( crontab -l 2>/dev/null | grep -vF '$(MONITOR_TAG)'; echo "$(MONITOR_CRON)" ) | crontab - 2>/dev/null; then \
	        echo "  ✓ uptime monitor armed — health check every 5 min  log: $(RUN_DIR)/monitor.log"; \
	        if [ ! -s $(RUN_DIR)/hc-ping-url ]; then \
	          echo "    logging only; email alerts stay off until you add a ping URL:"; \
	          echo "      echo '<healthchecks.io ping URL>' > $(RUN_DIR)/hc-ping-url"; \
	        fi; \
	      else \
	        echo "  ! could not install the cron watchdog — run 'make monitor' by hand to check"; \
	      fi; \
	    fi; \
	    echo; \
	    echo "  Stop everything with:  make stop"; \
	    echo "  Tail logs with:        make logs"; \
	    exit 0; \
	  fi; \
	  sleep 1; \
	done; \
	echo 'timed out waiting for tunnel URL; see $(CLOUDFLARED_LOG)'; exit 1

# Kill backend + cloudflared. Idempotent — fine to run repeatedly.
stop:
	@for label in backend cloudflared; do \
	  pidfile=$(RUN_DIR)/$$label.pid; \
	  if [ -f $$pidfile ]; then \
	    pid=$$(cat $$pidfile); \
	    if kill -0 $$pid 2>/dev/null; then \
	      echo "stopping $$label (pid $$pid)"; \
	      kill $$pid 2>/dev/null || true; \
	    fi; \
	    rm -f $$pidfile; \
	  fi; \
	done
	@# Belt-and-suspenders for stale pidfiles. "flowlog-playgro" is the
	@# Linux comm truncation (15 chars) of flowlog-playground-server.
	@pkill -x flowlog-playgro 2>/dev/null || true
	@pkill -x cloudflared 2>/dev/null || true
	@echo 'all stopped.'

status:
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
	  echo "  backend:     running (pid $$(cat $(BACKEND_PID)))  on $(BIND_ADDR)"; \
	else echo "  backend:     stopped"; fi
	@if [ -f $(CLOUDFLARED_PID) ] && kill -0 $$(cat $(CLOUDFLARED_PID)) 2>/dev/null; then \
	  echo "  cloudflared: running (pid $$(cat $(CLOUDFLARED_PID)))"; \
	  if [ -n "$(TUNNEL_NAME)" ]; then \
	    echo "  URL:         https://$(TUNNEL_HOSTNAME)  (named tunnel: $(TUNNEL_NAME))"; \
	  else \
	    URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	    [ -n "$$URL" ] && echo "  URL:         $$URL  (quick tunnel)"; \
	  fi; \
	else echo "  cloudflared: stopped"; fi

url:
	@if [ -n "$(TUNNEL_NAME)" ]; then echo "https://$(TUNNEL_HOSTNAME)"; \
	 else \
	   URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	   if [ -n "$$URL" ]; then echo "$$URL"; \
	   else echo '(no URL yet — start with "make start")'; exit 1; fi; \
	 fi

logs:
	@echo 'tailing $(BACKEND_LOG) + $(CLOUDFLARED_LOG)  (Ctrl+C to stop)'
	@tail -F $(BACKEND_LOG) $(CLOUDFLARED_LOG) 2>/dev/null

# One-time runbook for a persistent named tunnel (stable https://$(TUNNEL_HOSTNAME)
# that survives restarts, so DEFAULT_SERVER never has to change again). Cloudflare
# must manage the zone's DNS — flowlog-rs.com is on Namecheap today, so steps 1-2
# move it. This target only PRINTS the steps; you run them (they need a browser).
tunnel-setup: $(CLOUDFLARED_BIN)
	@echo 'Persistent named-tunnel setup — one time. Steps 1-2 are manual (browser):'
	@echo ''
	@echo '  1. Add flowlog-rs.com to Cloudflare (free plan):'
	@echo '       https://dash.cloudflare.com  →  Add a site  →  flowlog-rs.com'
	@echo '     Cloudflare imports existing DNS. VERIFY the GitHub Pages records came'
	@echo '     over (apex A records + the www CNAME → flowlog-rs.github.io) and leave'
	@echo '     them DNS-only (grey cloud) so the main site keeps serving from Pages.'
	@echo ''
	@echo '  2. At Namecheap (Domain List → Manage → Nameservers → Custom DNS), replace'
	@echo '     dns1/dns2.registrar-servers.com with the two nameservers Cloudflare gives'
	@echo '     you. Wait until Cloudflare marks the zone "Active" (minutes–hours).'
	@echo ''
	@echo '  3-5. Then run (uses ~/.cloudflared for creds; re-run on a fresh node):'
	@echo '       $(CLOUDFLARED_BIN) tunnel login          # pick the flowlog-rs.com zone'
	@echo '       $(CLOUDFLARED_BIN) tunnel create flowlog-playground'
	@echo '       $(CLOUDFLARED_BIN) tunnel route dns flowlog-playground $(TUNNEL_HOSTNAME)'
	@echo ''
	@echo '  6. Start using the stable name:'
	@echo '       make start TUNNEL_NAME=flowlog-playground'
	@echo '     Verify, then make it permanent by setting TUNNEL_NAME := flowlog-playground'
	@echo '     near the top of this Makefile. DEFAULT_SERVER becomes a fixed constant.'

# ─── Uptime monitoring (email alert if the backend goes down) ───────────────
# scripts/monitor.sh curls the public tunnel's /health end-to-end and pings a
# Healthchecks.io URL on success; if pings stop (tunnel/backend/node down) it
# emails you. Free, needs no mail server, and survives the changing quick-URL.
#
# `make start` always arms this watchdog (set MONITOR_AUTO=0 to opt out), so every
# machine keeps a health-check history in .run/monitor.log even with no ping URL
# configured. It alerts but never restarts: a DOWN backend stays down until you
# run `make start` again. The ping URL — the only machine-specific bit, and all
# that email alerting needs — is resolved in this order:
#   1. HC_PING_URL (make variable / env) — if set, it's written to .run/hc-ping-url
#   2. .run/hc-ping-url (per-machine file; NOT in git)
# Zero-touch on every new machine: set HC_PING_URL below so it's carried in git.
# ⚠ this repo is PUBLIC, so the URL would be visible (someone could spoof pings /
# mask a real outage). Leave it empty to keep the URL private and instead run
# `echo '<url>' > .run/hc-ping-url` once per machine.
HC_PING_URL  ?=
MONITOR_AUTO ?= 1
MONITOR_TAG  := flowlog-playground-monitor
MONITOR_CRON := */5 * * * * cd $(CURDIR) && bash scripts/monitor.sh >>$(RUN_DIR)/monitor.log 2>&1  \# $(MONITOR_TAG)

monitor:
	@bash scripts/monitor.sh

monitor-install:
	@mkdir -p $(RUN_DIR)
	@if [ -n "$(HC_PING_URL)" ]; then printf '%s\n' '$(HC_PING_URL)' > $(RUN_DIR)/hc-ping-url; fi
	@( crontab -l 2>/dev/null | grep -vF '$(MONITOR_TAG)'; echo "$(MONITOR_CRON)" ) | crontab -
	@echo 'installed cron watchdog (every 5 min).  logs: $(RUN_DIR)/monitor.log'
	@if [ ! -s $(RUN_DIR)/hc-ping-url ]; then \
	  echo 'note: no ping URL yet — email alerts are OFF until you add one:'; \
	  echo "  echo '<healthchecks.io ping URL>' > $(RUN_DIR)/hc-ping-url"; \
	fi
	@echo 'test check now (pings Healthchecks.io if healthy — confirm on your dashboard):'
	@bash scripts/monitor.sh || true
	@echo 'remove it with: make monitor-uninstall'

monitor-uninstall:
	@( crontab -l 2>/dev/null | grep -vF '$(MONITOR_TAG)' ) | crontab - || true
	@echo 'removed cron watchdog.'

# ─── Foreground variants (debugging) ───────────────────────────────────────

run: $(FLOWLOG_BIN) $(PROFILE_VIZ_BIN) $(SERVER_BIN)
	@echo '==> backend foreground on $(BIND_ADDR)  (Ctrl+C to stop)'
	@FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	 FLOWLOG_PROFILE_VIZ=$(PROFILE_VIZ_BIN) \
	 DATASETS_DIR=$(DATASETS_DIR) \
	 RUN_TIMEOUT_SECS=$(RUN_TIMEOUT_SECS) \
	 BIND_ADDR=$(BIND_ADDR) \
	 ALLOWED_ORIGINS='$(ALLOWED_ORIGINS)' \
	 $(SERVER_BIN)

tunnel: $(FLOWLOG_BIN) $(PROFILE_VIZ_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN)
	@echo '==> backend + cloudflared foreground (Ctrl+C stops both)'
	@FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	 FLOWLOG_PROFILE_VIZ=$(PROFILE_VIZ_BIN) \
	 DATASETS_DIR=$(DATASETS_DIR) \
	 RUN_TIMEOUT_SECS=$(RUN_TIMEOUT_SECS) \
	 BIND_ADDR=$(BIND_ADDR) \
	 ALLOWED_ORIGINS='$(ALLOWED_ORIGINS)' \
	 $(SERVER_BIN) >/tmp/flowlog-fg-backend.log 2>&1 & \
	 PID=$$!; \
	 trap "kill $$PID 2>/dev/null" EXIT INT TERM HUP; \
	 sleep 2; \
	 $(CLOUDFLARED_BIN) tunnel --no-autoupdate --url http://localhost:$(PORT)

# Full local test: backend on 127.0.0.1:$(LOCAL_PORT) + the Docusaurus dev
# server on $(LOCAL_WEB_PORT). The frontend's `?server=` override points the
# playground at the local backend, so no source edit is needed. Ctrl+C stops
# both. On a remote node, forward BOTH ports ($(LOCAL_WEB_PORT) and $(LOCAL_PORT)).
local: $(FLOWLOG_BIN) $(PROFILE_VIZ_BIN) $(SERVER_BIN) node_modules
	@command -v npm >/dev/null 2>&1 || { echo 'npm not found — install Node.js 22+ (https://nodejs.org) first'; exit 1; }
	@echo '==> starting backend on 127.0.0.1:$(LOCAL_PORT)  (log: /tmp/flowlog-local-backend.log)'
	@bash -c 'source $(CARGO_ENV) 2>/dev/null || true; \
	  FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	  FLOWLOG_PROFILE_VIZ=$(PROFILE_VIZ_BIN) \
	  DATASETS_DIR=$(DATASETS_DIR) \
	  RUN_TIMEOUT_SECS=$(RUN_TIMEOUT_SECS) \
	  BIND_ADDR=127.0.0.1:$(LOCAL_PORT) \
	  ALLOWED_ORIGINS="*" \
	  PATH="$(HOME)/.cargo/bin:$$PATH" \
	  $(SERVER_BIN) >/tmp/flowlog-local-backend.log 2>&1 & \
	  BACKEND_PID=$$!; \
	  trap "kill $$BACKEND_PID 2>/dev/null; echo; echo \"==> backend stopped\"" EXIT INT TERM HUP; \
	  sleep 1; \
	  if ! kill -0 $$BACKEND_PID 2>/dev/null; then \
	    echo "backend failed to start:"; tail -20 /tmp/flowlog-local-backend.log; exit 1; \
	  fi; \
	  msg="  Open:  http://localhost:$(LOCAL_WEB_PORT)/playground?server=http://localhost:$(LOCAL_PORT)  "; \
	  bar=$$(printf '─%.0s' $$(seq 1 $${#msg})); \
	  echo; \
	  echo "  ┌$$bar┐"; \
	  echo "  │$$msg│"; \
	  echo "  └$$bar┘"; \
	  echo "  remote node? forward ports $(LOCAL_WEB_PORT) and $(LOCAL_PORT).   Ctrl+C stops both."; \
	  echo; \
	  npm start -- --no-open --port $(LOCAL_WEB_PORT)'

# Install web dependencies on demand (used by `make local`).
node_modules: package.json
	@command -v npm >/dev/null 2>&1 || { echo 'npm not found — install Node.js 22+ (https://nodejs.org) first'; exit 1; }
	@echo '==> installing web dependencies (npm install)'
	@npm install --no-audit --no-fund

# ─── Maintenance ───────────────────────────────────────────────────────────

update:
	@echo '==> pulling this repo'
	git pull --ff-only
	@if [ -d $(FLOWLOG_DIR) ]; then \
		echo '==> pulling flowlog'; \
		cd $(FLOWLOG_DIR) && git pull --ff-only; \
	fi
	@bash -c 'source $(CARGO_ENV) 2>/dev/null || true; \
		cd $(FLOWLOG_DIR) && cargo build --release && \
		cd $(SERVER_DIR) && cargo build --release'
	@$(MAKE) stop
	@$(MAKE) start

clean:
	rm -rf $(SERVER_DIR)/target

clean-flowlog:
	rm -rf $(FLOWLOG_DIR)
