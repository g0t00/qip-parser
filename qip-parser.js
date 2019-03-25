#!/usr/local/bin/node

'use strict';
const child_process = require('child_process');
const fs = require('fs');
const arrayUniq = require('array-uniq');
class QipParser {
  constructor(path, relativePath, dependency = false) {
    this.dependency = dependency;
    this.path = path;
    this.relativePath = relativePath;
    this.getFileContents();
  }
  getFileContents() {
    this.QipText = fs.readFileSync(this.path, {
      encoding: 'utf8'
    });
  }
  parse() {
    let files = [];
    let filesDependency = [];
    this.QipText.split('\n').forEach(line => {
      // console.log('line', line);
      let dependency = false;
      if (line.match(/#dep/i)) {
        dependency = true;
      }
      line = line.replace(/#.*/, '');
      if (line.match('set_global_assignment') !== null) {
        let match = line.match(/-library ([^ ]+)/);
        let work = 'work';
        if (match !== null) {
          work = match[1];
        }
        let pathMatch = line.match(/\[file join \$::quartus\(qip_path\) "([^"]+)"\]/);
        if (line.match('-name VHDL_FILE') !== null) {

          if (pathMatch !== null) {
            let path = pathMatch[1];
            // let mixedFlag = path.match(/pkg/i) !== null ? '-mixedsvvh' : '';
            let mixedFlag = '-mixedsvvh';
            if (this.dependency || dependency) {
              const file = {path: this.relativePath + path, work};
              filesDependency.push(file);
            } else {
              const file = {path: this.relativePath + path, work};
              files.push(file);
            }
            // console.log(command);
          } else {
            console.error('A unable to parse: ', line);
          }
        } else if (line.match('-name QIP_FILE')) {
          if (pathMatch !== null) {
            let path = pathMatch[1];
            let pathArg = path.replace(/[^/]*$/, '');
            const subParser = new QipParser(this.relativePath + path, this.relativePath + pathArg, this.dependency || dependency);
            const [filesNew, filesDependencyNew] = subParser.parse();
            files = files.concat(filesNew);
            filesDependency = filesDependency.concat(filesDependencyNew);
          } else {
            console.error('B unable to parse: ', line);
          }
        } else {
          console.error('C unable to parse: ', line);
        }
      }

      // console.log(line);
    });
    return [files, filesDependency];
  }
}
let targetFile = process.argv[2];
let relativePath = targetFile.replace(/[^/]+$/, '');
const parser = new QipParser(targetFile, relativePath);
let [files, filesDependency] = parser.parse();
// console.log(doFile);
files.forEach(file => {
  file.path = file.path.replace(/[^/ .]+\/\.\.\//g, '')
});
filesDependency.forEach(file => {
  file.path = file.path.replace(/[^/ .]+\/\.\.\//g, '')
});
files = files.filter(file => {
  return typeof filesDependency.find(fileSearch => file.path === fileSearch.path) === 'undefined';
})
// console.log(doFile);
filesDependency = arrayUniq(filesDependency);
files = arrayUniq(files);
let doFile = 'if {$argc == 0} {\n';
for (const file of filesDependency) {
  doFile += `vcom -2008 -mixedsvvh -work ${file.work} ${file.path}\n`;
}
doFile += '}\n';
for (const file of files) {
  doFile += `vcom -2008 -mixedsvvh -work ${file.work} ${file.path}\n`;
}
// doFile = optimizeDoFile(doFile);
doFile = '#### auto generated with qip-parser. DONT EDIT ####\n'  + doFile;
fs.writeFileSync(relativePath + 'sources.do', doFile);
// console.log(parser.parse());
