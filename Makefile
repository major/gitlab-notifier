.PHONY: build sign lint clean start

build:
	npm run build

sign:
	npm run sign

lint:
	npm run lint

clean:
	./build.sh -c

start:
	npm run start
