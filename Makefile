# Фронт отдельно от FastAPI: только nginx + статика Vite (base /app/).
# Бэкенд указывается в приложении (src/api.ts) или через env при сборке.

IMAGE ?= clash-royale-imposter-frontend
PORT ?= 8080

.PHONY: help build run stop dev clean

help:
	@echo "Targets:"
	@echo "  make build   - docker build -t $(IMAGE)"
	@echo "  make run     - контейнер на http://localhost:$(PORT)/app/"
	@echo "  make stop    - остановить контейнер (docker stop)"
	@echo "  make dev     - npm run dev (локально, без Docker)"
	@echo "  make clean   - docker rmi $(IMAGE)"

build:
	docker build -t $(IMAGE) .

run: build
	docker run --rm --name $(IMAGE) -p $(PORT):80 $(IMAGE)

stop:
	-docker stop $(IMAGE)

dev:
	npm run dev

clean:
	-docker rmi $(IMAGE)
