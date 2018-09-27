const BATCH_SIZE = 20000;

console.log("\nRunning pepSQL database creation script...\n");

let config, processProtein, mysql, fastaParser, fs;

try {
  config = require('./config.json');
  processProtein = require('./util').processProtein;
  mysql = require('sync-mysql');
  fastaParser = require('fasta-js');
  fs = require('fs');
}
catch (e) {
  console.log("Error loading one or more modules. Did you run 'npm install' yet? Also, make sure your config file is formatted properly.\n");
  process.exit(1);
}

let connection = new mysql({
  host     : config.server_address,
  port     : config.server_port,
  user     : config.server_username,
  password : config.server_password,
  database : config.db_name
});

let table_creation_command = 
  `CREATE TABLE IF NOT EXISTS\`${config.db_name}\`.\`${config.table_name}\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`mass\` DOUBLE NOT NULL,
  \`sequence\` VARCHAR(100) NOT NULL,
  \`missed_cleavages\` INT NOT NULL,
  \`enzyme\` VARCHAR(100) NOT NULL,
  \`prevAA\` VARCHAR(1) NOT NULL,
  \`nextAA\` VARCHAR(1) NOT NULL,
  \`length\` INT NOT NULL,
  \`accession\` VARCHAR(128) NOT NULL,
  \`organism\` VARCHAR(100) NOT NULL,
  \`modifications\` JSON NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`id_UNIQUE\` (\`id\` ASC))`;

connection.query(table_creation_command);
console.log('Table created');

for(let i=0; i<config.fastaFiles.length; i++) {
  let organismName = config.fastaFiles[i].organism;
  let fileName = config.fastaFiles[i].file;

  console.log(`Reading in file: ${fileName}\n`);

  let data = fs.readFileSync(fileName, 'utf8');
  let fastaOptions = {
    'definition': 'gi|accession|description',
    'delimiter': '|'
  };
  let fasta = new fastaParser(fastaOptions);
  let fastaEntries = fasta.parse(data);

  let count = 0;
  let numIntervalsTotal = 20;
  let numIntervalsElapsed = 0;
  let interval = parseInt(fastaEntries.length/numIntervalsTotal);

  let queue = [];

  for(let j=0; j<fastaEntries.length; j++) {
    if(count%interval===0) {
      let progress = numIntervalsElapsed * (100/numIntervalsTotal);
      process.stdout.write(progress+"% ");
      numIntervalsElapsed++;
    }
    count++;
    let entry = fastaEntries[j];
    let newPeptides = processProtein(entry, config, organismName, false);
    for(let z=0; z<newPeptides.length; z++) {
      queue.push(newPeptides[z]);
    }
    if(config.createDecoys) {
      newPeptides = processProtein(entry, config, organismName, true);
      for(let z=0; z<newPeptides.length; z++) {
        queue.push(newPeptides[z]);
      }
    }

    if(queue.length >= BATCH_SIZE || j===fastaEntries.length-1) {
      let insertList = queue.map((item) => {
        return "('"+item.join("','")+"')";
      });
      insertSQL = 
        `INSERT INTO ${config.table_name}
        (mass, sequence, missed_cleavages, enzyme, prevAA, nextAA, length, accession, organism, modifications)
        VALUES ${insertList.join(",")}`;
      connection.query(insertSQL);
      queue = [];
    }
    
  } 
  process.stdout.write("\n");
}

console.log('Creating index...');
try {
  let index_command = `CREATE INDEX idx_mass ON ${config.table_name}(mass)`;
  connection.query(index_command);
  console.log('Index created');
}
catch (e) {
  console.log('Index already exists');
}

console.log("Done!");

process.exit(0);


