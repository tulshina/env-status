#!/usr/bin/env node
const program = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const shell = require('shelljs');
const axios = require('axios');
const moment = require('moment');
const Ora = require('ora');

let accessToken;
program.version('1.0.0');
program.name('env-status');
program.arguments('[token]');
program.action((arg) => {
    accessToken = arg;
});
program.parse(process.argv);

const logError = (message, exitCode = undefined) => {
    console.log(chalk.red(`[ERROR] ${message}`));
    if (exitCode !== undefined) process.exit(exitCode);
};

const appConfDir = `${process.env.HOME}/.config/env-status`;
// console.log(appConfDir)
const readToken = () => {
    if (accessToken === undefined) {
        try {
            accessToken = fs.readFileSync(`${appConfDir}/.token`, {encoding: 'utf8'}).trim();
        } catch (e) {
            logError('Please provide your token to access TeamCity!');
            console.log('See: https://www.jetbrains.com/help/teamcity/managing-your-user-account.html');
            console.log(`Example: ${program.name()} AMGuaGHuTGlua593.UMAtMTY2MA==.hkjh123123JJLKjl`);
            logError('Failed to read token from file .token', 255);
        }
    }
};

const loadColorMap = () => {
    const configFile = `${appConfDir}/config.js`;
    const defaultColorMapFunction = function (chalk) {
        return {
            'Dev2': chalk.yellow,
            'Dev3': chalk.yellow,
            'Dev4': chalk.yellow,
            'Audt': chalk.yellow
        };
    };
    if (!fs.existsSync(configFile)) {
        console.log(chalk.yellow(`Now you can adjust output colors in config file: `) + configFile);
        fs.mkdirSync(appConfDir, {recursive: true});
        fs.writeFileSync(configFile, `// find available colors at: https://github.com/chalk/chalk#readme
module.exports = {
    makeColorMap: ${defaultColorMapFunction.toString()}
};
`);
    }

    try {
        const {makeColorMap} = require(configFile);
        return makeColorMap(chalk);
    } catch (e) {
        logError(`Failed to load color map from config file, using default one.`);
        return defaultColorMapFunction(chalk);
    }
};

const colorMap = loadColorMap();

const colorizeState = (state) => {
    const found = colorMap[state.trim()];
    return found ? found(state) : state;
};


const main = async () => {
    readToken();
    const envs = ["Dev2", "Dev3", "Dev4", "Audt"]
    const API_URL = `https://buildserver.labs.intellij.net/app/rest/builds`;

    console.log(chalk.green(`Fetching data about ${envs.length} environments...`));

    const result = [];

    const ora = new Ora({
        text: 'Fetching data',
    });

    ora.start();

    for (const env of envs) {
        try {
            ora.text = `(${env}/${envs.length}) Fetching data about ${env}`;
            const {
                data: {
                    build
                }
            } = await axios.get(`${API_URL}`, {
                timeout: 5000,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                params: {
                    locator: `buildType:ItDeployments_CRMext_ECSv2_Nonprod_${env}_OneClickDeployment,count:1,defaultFilter:false`,
                },
            });
            const buildId = build[0].id

            const {
                data: {
                    finishDate,
                    status,
                    state,
                    branchName,
                    triggered: {user: {name}}
                }
            } = await axios.get(`${API_URL}/id:${buildId}`, {
                timeout: 5000,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const resDate = finishDate ? moment(finishDate).format('YYYY-MM-DD HH:mm:ss') : '----------';
            const envColorized = colorizeState(`${env}`.padEnd(5));
            const formatted = `[${envColorized}]  ${name.padEnd(20)} ${resDate.padEnd(20)}  ${state.padEnd(15)} ${branchName}`;
            result.push({formatted});
        }
    catch (e) {
            ora.fail(`Failed to fetch ${env} data: ${e.message}`);
            ora.start(`Resuming...`);
        }
    }

    ora.text = 'All required data fetched';
    ora.succeed();
    console.log(`${`Env:`.padEnd(7)}  ${`Deployed by:`.padEnd(19)}  ${`Finish Date:`.padEnd(19)}   ${`State:`.padEnd(14)}  ${`BranchName:`.padEnd(20)}`);
    console.log(`${`----`.padEnd(7)}  ${`------------`.padEnd(19)}  ${`------------`.padEnd(19)}   ${`------`.padEnd(14)}  ${`-----------`.padEnd(20)}`);
    result
        .forEach(({formatted}) => console.log(formatted));

};

main();
