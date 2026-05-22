#
# FlowLog Playground Server — automation
#
# First-time setup on a fresh CloudLab node:
#   make            # clone flowlog, build everything, start backend + tunnel
#                   # detached, then print the HTTPS URL to use in playground.js
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

# --- this repo ------------------------------------------------------------
SERVER_DIR       := $(CURDIR)/server
SERVER_BIN       := $(SERVER_DIR)/target/release/flowlog-playground-server

# --- cloudflared (HTTPS tunnel) -------------------------------------------
CLOUDFLARED_BIN  := $(HOME)/bin/cloudflared
CLOUDFLARED_URL  := https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# --- runtime knobs (override on the command line) -------------------------
PORT             ?= 8080
BIND_ADDR        ?= 0.0.0.0:$(PORT)
ALLOWED_ORIGINS  ?= *

# --- runtime state (pid files + logs live here) ---------------------------
RUN_DIR          := $(CURDIR)/.run
BACKEND_PID      := $(RUN_DIR)/backend.pid
CLOUDFLARED_PID  := $(RUN_DIR)/cloudflared.pid
BACKEND_LOG      := $(RUN_DIR)/backend.log
CLOUDFLARED_LOG  := $(RUN_DIR)/cloudflared.log

# Regex for the public HTTPS URL cloudflared writes to its log.
TUNNEL_URL_RE    := https://[a-z0-9-]+\.trycloudflare\.com

.DEFAULT_GOAL := all

.PHONY: help all setup env flowlog server cloudflared \
        start stop status url logs run tunnel \
        update clean clean-flowlog

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
	@echo ''
	@echo 'Build / setup:'
	@echo '  make setup           build everything, do not start anything'
	@echo '  make env             only run flowlog env/env.sh (one-time)'
	@echo '  make flowlog         only build flowlog-compiler'
	@echo '  make server          only build the playground server'
	@echo '  make cloudflared     only download cloudflared'
	@echo '  make update          git-pull + rebuild'
	@echo '  make clean           remove server/target'
	@echo '  make clean-flowlog   wipe the flowlog checkout entirely'
	@echo ''
	@echo 'Foreground (debugging):'
	@echo '  make run             backend only, foreground'
	@echo '  make tunnel          backend + cloudflared, foreground (Ctrl+C stops both)'
	@echo ''
	@echo 'Override variables, e.g.:'
	@echo '  make start PORT=9000'
	@echo '  make start ALLOWED_ORIGINS="https://flowlog-rs.github.io,http://localhost:3001"'

all: start

setup: $(FLOWLOG_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN)

env: $(ENV_MARKER)
flowlog: $(FLOWLOG_BIN)
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

# 4. Build the playground server. Independent of flowlog-compiler at build
#    time (only needed at runtime), so `make -j` can build both in parallel.
$(SERVER_BIN):
	@echo '==> building playground server (release)'
	@bash -c 'source $(CARGO_ENV) 2>/dev/null || true; cd $(SERVER_DIR) && cargo build --release'

# 5. Download cloudflared (static binary, no install needed).
$(CLOUDFLARED_BIN):
	@echo '==> downloading cloudflared → $(CLOUDFLARED_BIN)'
	@mkdir -p $(dir $(CLOUDFLARED_BIN))
	curl -fSL --output $(CLOUDFLARED_BIN) $(CLOUDFLARED_URL)
	chmod +x $(CLOUDFLARED_BIN)

# ─── Detached service control ───────────────────────────────────────────────

# Start backend + cloudflared in the background (idempotent: skips anything
# already running) and print the HTTPS URL when the tunnel comes up.
start: $(FLOWLOG_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN)
	@mkdir -p $(RUN_DIR)
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
	  echo "==> backend already running (pid $$(cat $(BACKEND_PID)))"; \
	else \
	  echo '==> starting backend (detached)  log: $(BACKEND_LOG)'; \
	  nohup bash -c 'source $(CARGO_ENV) 2>/dev/null || true; \
	    FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
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
	  echo '==> starting cloudflared (detached)  log: $(CLOUDFLARED_LOG)'; \
	  : > $(CLOUDFLARED_LOG); \
	  nohup $(CLOUDFLARED_BIN) tunnel --url http://localhost:$(PORT) \
	    >$(CLOUDFLARED_LOG) 2>&1 & \
	  echo $$! > $(CLOUDFLARED_PID); \
	fi
	@echo '==> waiting for tunnel URL...'
	@for i in $$(seq 1 30); do \
	  URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	  if [ -n "$$URL" ]; then \
	    echo; \
	    echo "  ┌─────────────────────────────────────────────────────────────────────┐"; \
	    printf  "  │  HTTPS URL:  %-54s │\n" "$$URL"; \
	    echo "  └─────────────────────────────────────────────────────────────────────┘"; \
	    echo; \
	    echo "  Paste into src/pages/playground.js as DEFAULT_SERVER:"; \
	    echo "    const DEFAULT_SERVER = '$$URL';"; \
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
	  URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	  [ -n "$$URL" ] && echo "  URL:         $$URL"; \
	else echo "  cloudflared: stopped"; fi

url:
	@URL=$$(grep -oE '$(TUNNEL_URL_RE)' $(CLOUDFLARED_LOG) 2>/dev/null | head -1); \
	 if [ -n "$$URL" ]; then echo "$$URL"; \
	 else echo '(no URL yet — start with "make start")'; exit 1; fi

logs:
	@echo 'tailing $(BACKEND_LOG) + $(CLOUDFLARED_LOG)  (Ctrl+C to stop)'
	@tail -F $(BACKEND_LOG) $(CLOUDFLARED_LOG) 2>/dev/null

# ─── Foreground variants (debugging) ───────────────────────────────────────

run: $(FLOWLOG_BIN) $(SERVER_BIN)
	@echo '==> backend foreground on $(BIND_ADDR)  (Ctrl+C to stop)'
	@FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	 BIND_ADDR=$(BIND_ADDR) \
	 ALLOWED_ORIGINS='$(ALLOWED_ORIGINS)' \
	 $(SERVER_BIN)

tunnel: $(FLOWLOG_BIN) $(SERVER_BIN) $(CLOUDFLARED_BIN)
	@echo '==> backend + cloudflared foreground (Ctrl+C stops both)'
	@FLOWLOG_COMPILER=$(FLOWLOG_BIN) \
	 BIND_ADDR=$(BIND_ADDR) \
	 ALLOWED_ORIGINS='$(ALLOWED_ORIGINS)' \
	 $(SERVER_BIN) >/tmp/flowlog-fg-backend.log 2>&1 & \
	 PID=$$!; \
	 trap "kill $$PID 2>/dev/null" EXIT INT TERM HUP; \
	 sleep 2; \
	 $(CLOUDFLARED_BIN) tunnel --url http://localhost:$(PORT)

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
