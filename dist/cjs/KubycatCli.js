#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const KubycatConfig_js_1 = __importDefault(require("./KubycatConfig.js"));
const Kubycat_js_1 = __importDefault(require("./Kubycat.js"));
class KubycatCli {
    static main(args) {
        console.log('Kubycat version ' + this.version + '\n');
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
        const config = KubycatConfig_js_1.default.fromYamlFile(configFile);
        const kubycat = new Kubycat_js_1.default(config);
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
KubycatCli.version = '1.1.1';
KubycatCli.main(process.argv.slice(2));
