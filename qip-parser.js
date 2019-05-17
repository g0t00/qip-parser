#!/usr/local/bin/node

'use strict';
const child_process = require('child_process');
const fs = require('fs');
const {argv} = require('process');
let recursionCounter = 0;
class QipParser {
  constructor(path, relativePath, parent) {
    recursionCounter++;
    if (recursionCounter > 1000) {
      throw new Error(`Opening more than 1000 qip-files. Circular Dependency probable. file: ${this.path} referenced in ${this.parent.path}!`);
    }
    this.path = path;
    this.relativePath = relativePath;
    this.parent = parent;
    this.getFileContents();
  }
  getFileContents() {
    try {
      this.QipText = fs.readFileSync(this.path, {
        encoding: 'utf8'
      });
    } catch(err) {
      throw new Error(`Can not open file ${this.path} referenced in ${this.parent.path}!`);
    }
  }
  parse() {
    let files = [];
    this.QipText = this.QipText.replace(/\r/g, '');
    this.QipText.split('\n').forEach(line => {
      // console.log('line', line);
      line = line.replace(/#.*/, '');
      if (line.match('set_global_assignment') !== null) {
        let match = line.match(/-library ([^ ]+)/);
        let work = 'work';
        if (match !== null) {
          work = match[1];
        }
        let pathMatch = line.match(/\[file join \$::quartus\(qip_path\)\s+"([^"]+)"\]/);
        if (line.match('-name VHDL_FILE') !== null) {

          if (pathMatch !== null) {
            let path = pathMatch[1];
            // let mixedFlag = path.match(/pkg/i) !== null ? '-mixedsvvh' : '';
            let mixedFlag = '-mixedsvvh';
            const file = {path: this.relativePath + path, work, parent: this};
            files.push(file);
            // console.log(command);
          } else {
            console.error('A unable to parse: ', line);
          }
        } else if (line.match('-name QIP_FILE')) {
          if (pathMatch !== null) {
            let path = pathMatch[1];
            let pathArg = path.replace(/[^/]*$/, '');
            const subParser = new QipParser(this.relativePath + path, this.relativePath + pathArg, this);
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
for (const file of files) {
  let changedPath = file.path.replace(/[^\/ .]+\/\.\.\//g, '');
  while (file.path !== changedPath) {
    file.path = changedPath;
    changedPath = file.path.replace(/[^\/ .]+\/\.\.\//g, '');
  }
}
let lastCompile;
try {
  lastCompile = fs.statSync(touchFile).mtimeMs;

} catch (e) {
  lastCompile = 0;
}
let doFile = [];
// order files
const compare = (a, b) => {
  // console.log('compare', a.packageName, b.packageName,  a.path, b.path);
  if (a.isPackage) {
    if (!b.isPackage) {
      return false;
    }
    // console.log(`use\\s+(${a.work}|work)\\.${a.packageName}\\.all;`, b.path);
    if (a.text.match(new RegExp(`use\\s+(${b.work}|work)\\.${b.packageName}\\.all;`, 'im')) !== null) {
      return true;
    } else {
      return false;
    }
  } else if (b.isPackage) {
    return true;
  }
  if (!b.entity) {
    return false;
  }
  if (!a.entity) {
    return false;
  }
  if (a.text.match(new RegExp(`entity\\s+(${b.work}|work)\\.${b.entity}`, 'im'))) {
    return true;
  }

  return false;
}
let changed = true;
files = files.filter((file, index) => {
  return files.slice(index + 1)
  .findIndex(fileSearch => fileSearch.path === file.path && fileSearch.work === fileSearch.work) === -1;
})
for (const file of files) {
  try {
    file.text = fs.readFileSync(file.path, {encoding: 'utf8'});
  } catch (e) {
    throw new Error(`Can not open file ${file.path} referenced in ${file.parent.path}!`);
  }
  const match = file.text.match(/^\s*entity\s+(\w+)\s*is/im);
  if (match !== null) {
    file.entity = match[1];
  } else {
    // console.error('no entity', file.path);
  }
  const packageMatch = file.text.match(/^\s*package\s+(\w+)\s+is/im);
  file.isPackage = false;
  if (packageMatch !== null) {
    file.packageName = packageMatch[1];
    file.isPackage = true;
  }

}
// console.log(files.map(file => [file.path, file.packageName]));
let changeCounter = 0;
while (changed) {
  changed = false;
  loop: for (let a = 0; a < files.length - 1; a++) {
    for (let b = a + 1; b < files.length; b++) {
      if (compare(files[a], files[b])) {
        // console.log(`swapping ${a} ${b} ${files[a].path}: ${files[a].entity} with ${files[b].path}: ${files[b].entity}`);
        // console.log(files.map(file => file.entity));
        const bObj = files.splice(b, 1)[0];
        files.splice(a, 0, bObj);
        // console.log(files.map(file => file.entity));
        // asd;
        changed = true;
        changeCounter++;
        break loop;
      }
    }
  }
}
for (const file of files) {
  const thisChangeTime = fs.statSync(file.path).mtimeMs;
  if (thisChangeTime > lastCompile || argv[3] == '--build-all') {
    doFile.push(`vcom -2008 -mixedsvvh -work ${file.work} ${file.path}`);
  }
}
doFile.push(`set fp [open "${touchFile}" w+]`);
doFile.push(`close $fp`);
doFile.push(`file mtime ${touchFile} [clock seconds]`);
doFile = doFile.join('\n');
// doFile = optimizeDoFile(doFile);
doFile = '#### auto generated with qip-parser. DONT EDIT ####\n'  + doFile;
fs.writeFileSync(relativePath + 'sources.do', doFile);
// console.log(parser.parse());
