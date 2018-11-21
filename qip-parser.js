#!/usr/local/bin/node

'use strict';
const child_process = require('child_process');
const fs = require('fs');
const arrayUniq = require('array-uniq');
const {argv} = require('process');

class QipParser {
  constructor(path, relativePath) {
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
    this.QipText.split('\n').forEach(line => {
      // console.log('line', line);
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
            const file = {path: this.relativePath + path, work};
            files.push(file);
            // console.log(command);
          } else {
            console.error('A unable to parse: ', line);
          }
        } else if (line.match('-name QIP_FILE')) {
          if (pathMatch !== null) {
            let path = pathMatch[1];
            let pathArg = path.replace(/[^/]*$/, '');
            const subParser = new QipParser(this.relativePath + path, this.relativePath + pathArg);
            const filesNew = subParser.parse();
            files = files.concat(filesNew);
          } else {
            console.error('B unable to parse: ', line);
          }
        } else {
          console.error('C unable to parse: ', line);
        }
      }

      // console.log(line);
    });
    return files;
  }
}
let targetFile = process.argv[2];
let relativePath = targetFile.replace(/[^/]+$/, '');
const touchFile = relativePath + 'sources.touch';
const parser = new QipParser(targetFile, relativePath);
let files = parser.parse();
files.forEach(file => {
  file.path = file.path.replace(/[^/ .]+\/\.\.\//g, '')
});
let lastCompile;
try {
  lastCompile = fs.statSync(touchFile).mtimeMs;

} catch (e) {
  lastCompile = 0;
}
let doFile = [];
for (const file of files) {
  const thisChangeTime = fs.statSync(file.path).mtimeMs;
  if (thisChangeTime > lastCompile || argv[3] == '--build-all') {
    doFile.push(`vcom -2008 -mixedsvvh -work ${file.work} ${file.path}`);
  }
}
doFile = arrayUniq(doFile);
doFile.push(`touch ${touchFile}`);
doFile = doFile.join('\n');
// doFile = optimizeDoFile(doFile);
doFile = '#### auto generated with qip-parser. DONT EDIT ####\n'  + doFile;
fs.writeFileSync(relativePath + 'sources.do', doFile);
// console.log(parser.parse());
