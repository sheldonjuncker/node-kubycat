import test from 'ava';
import Kubycat from "./dist/kubycat.js";
import KubycatConfig from "./dist/KubycatConfig.js";

test('find-modules', async t => {
    const kubycat = new Kubycat(new KubycatConfig('test.yaml'));
    t.is(kubycat.config.config, 'test.yaml');
});