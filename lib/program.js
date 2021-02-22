'use strict';

const fs = require('fs-extra');
const path = require('path');
const argv = require("process.argv");
const inquirer = require('inquirer');
const marked = require('marked');
const TerminalRenderer = require('marked-terminal');
const ProgressBar = require('progress');

marked.setOptions({
    // Define custom renderer
    renderer: new TerminalRenderer()
});

const processArgv = argv(process.argv.slice(2));

const config = processArgv();

class Program {
    constructor() {
        this.projectPath = process.cwd();
        this.pkgFilePath = `${this.projectPath}/package.json`;
        this.nodeModulesDirPath = `${this.projectPath}/node_modules`;
        this.dependenciesObj = {};
        this.pkg = undefined;
    }
    async start() {
        // 0.命令参数解析
        await this.resolveProcessArgv();
        // 1.检查项目结构是否属于nodejs
        await this.isNodejsProject();
        // 2.获取node_modules版本号
        await this.getReallyVersion();
        // 3.写入package.json
        await this.writeReallyVersion();
    }
    async resolveProcessArgv() {
        if (config.path) {
            const askQuestions = () => {
                const questions = [
                    {
                        name: "path",
                        type: "input",
                        message: "Please enter the project path"
                    },
                ];
                return inquirer.prompt(questions);
            };
            const answers = await askQuestions();
            this.projectPath = answers.path;
            return Promise.resolve();
        }
        if (config.help) {
            this.showHelp();
            process.exit(0);
        }
        if (config.version) {
            const version = require(path.join(__dirname, '../package.json')).version;
            console.log(version);
            process.exit(0);
        }
        let args = [];
        if (config["--"]) {
            args = config["--"];
        } else {
            args = Object.keys(config)
        }
        const cliArgs = ['help', 'path', 'version'];
        if (args.length !== 0 && !cliArgs.includes(args[0])) {
            this.showHelp();
            process.exit(0);
        }
        if (args.length === 0) return Promise.resolve();
    }
    async isNodejsProject() {
        (await fs.stat(this.pkgFilePath)).isFile();
        (await fs.stat(this.nodeModulesDirPath)).isDirectory();
        this.pkg = require(this.pkgFilePath);
        // Promise.all([
        //     (await fs.stat(this.pkgFilePath)).isFile(),
        //     (await fs.stat(this.nodeModulesDirPath)).isDirectory(),
        // ]);
    }
    showHelp() {
        const helpMD = fs.readFileSync(path.join(__dirname, './help.md'), 'utf8');
        console.log(marked(helpMD));
    }
    getReallyVersion() {
        const devDependenciesList = Object
            .keys(this.pkg.devDependencies || {})
            .map(key => ({ depType: 'devDependencies', dependencies: key }));
        const dependenciesList = Object
            .keys(this.pkg.dependencies || {})
            .map(key => ({ depType: 'dependencies', dependencies: key }));
        const allDependenciesList = [...devDependenciesList, ...dependenciesList];
        const bar = new ProgressBar('dependencies syncing [:bar] :current/:total', { total: allDependenciesList.length });
        let len = 0;
        allDependenciesList.map(dep => {
            const { depType, dependencies } = dep;
            let depPkgPath = '';
            if (dependencies.startsWith('@')) {
                const [domainPath, subPath] = dependencies.split('/');
                depPkgPath = path.join(this.projectPath, `/node_modules/${domainPath}/${subPath}/package.json`);
            } else {
                depPkgPath = path.join(this.projectPath, `/node_modules/${dependencies}/package.json`);
            }
            const depPkg = require(depPkgPath);
            if (this.dependenciesObj[depType]) {
                this.dependenciesObj[depType][dependencies] = depPkg.version;
            } else {
                this.dependenciesObj[depType] = {};
                this.dependenciesObj[depType][dependencies] = depPkg.version;
            }
            bar.tick(len + 1);
        });
    }
    writeReallyVersion() {
        const pkg = { ...this.pkg };
        pkg.dependencies = this.dependenciesObj.dependencies;
        pkg.devDependencies = this.dependenciesObj.devDependencies;
        // JSON.stringify 值为undefined在序列化过程中会被忽略。在写入文件时反而不会造成package.json格式错误。
        // {
        //     devDependencies: {
        //         'fs-extra': '9.1.0'
        //     },
        //     dependencies: undefined,
        // }
        let text = JSON.stringify(pkg, "", "\t")
        fs.writeFileSync(this.pkgFilePath, text);
    }
}

module.exports = Program;