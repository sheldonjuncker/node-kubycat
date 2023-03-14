#!/usr/bin/env node

import KubycatConfig from "./KubycatConfig.js";
import Kubycat from "./Kubycat.js";
import fs from 'fs';

class KubycatCli {
    public static main(args: string[]): void {
        if (args.length < 1) {
            console.error('Please provide a config file');
            return;
        }

        const info = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        console.log('Welcome to Kubycat v' + info.version + '!\n');

        const configFile = args[0] || 'config.yaml';

        console.log('Reading from config file: ' + configFile + '...');

        const config = KubycatConfig.fromYamlFile(configFile);
        const kubycat = new Kubycat(config);

        console.log('Config file loaded successfully.\n');

        console.log('Watching for file changes recursively in the following paths:');
        for (const sync of config.syncs) {
            if (!sync.enabled) {
                continue;
            }

            console.log(sync.name + ':')
            for (const from of sync.from) {
                console.log(' - ' + sync.base + '/' + from);
            }
        }

        console.log('');
        console.log('Watching files...');
        console.log('Press Ctrl+C to exit.\n');
        kubycat.watchFiles();
    }
}

KubycatCli.main(process.argv.slice(2));