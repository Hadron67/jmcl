
all: lib/jmcl.js

lib/jmcl.js: src/* rollup.config.js tsconfig.json
	rollup -c

clean:
	$(RM) lib/jmcl.js lib/jmcl.js.map

.PHONY: clean