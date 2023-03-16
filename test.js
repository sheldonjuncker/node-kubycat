import test from 'ava';
import Kubycat from "./dist/kubycat.js";
import KubycatConfig from "./dist/KubycatConfig.js";

test('load-yaml', async t => {
    const kubycat = new Kubycat(KubycatConfig.fromYaml(`
kubycat:
  namespace: default
  sync:
    - name: web-app
      base: /home/user/web-app
      from:
        - index.php
      to: /var/www/html
      pod: web-app
      shell: /bin/bash
`));
    t.is(kubycat.config.namespace, "default");
});