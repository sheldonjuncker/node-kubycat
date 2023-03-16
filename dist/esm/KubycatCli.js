#!/usr/bin/env node
import KubycatConfig from "./KubycatConfig.js";
import Kubycat from "./Kubycat.js";
import fs from 'fs';
class KubycatCli {
    static main(args) {
        const info = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        console.log('Kubycat version ' + info.version + '\n');
        if (args.length < 1) {
            console.error('Please provide a config file');
            return;
        }
        const configFile = args[0] || 'config.yaml';
        if (configFile == 'help') {
            console.log('Usage: kubycat <config-file>|version|help');
            return;
        }
        if (configFile == 'version') {
            return;
        }
        console.log('Reading from config file: ' + configFile + '...');
        const config = KubycatConfig.fromYamlFile(configFile);
        const kubycat = new Kubycat(config);
        console.log('Config file loaded successfully.\n');
        console.log('Watching for file changes recursively in the following paths:');
        for (const sync of config.syncs) {
            if (!sync.enabled) {
                continue;
            }
            console.log(sync.name + ':');
            for (const from of sync.from) {
                console.log(' - ' + sync.base + '/' + from);
            }
        }
        console.log('');
        console.log('Watching for files to sync...\t\t\tCtrl+C to exit');
        kubycat.start();
    }
}
KubycatCli.main(process.argv.slice(2));
