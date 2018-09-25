let config = require('./config.json');
let mysql = require('sync-mysql');
let unimod = require('js-unimod');
let fastaParser = require('fasta-js');
let peptideCutter = require('peptide-cutter');
let pepMod = require('peptide-modifier');
let fs = require('fs');
let csvWriter = require('csv-write-stream');

let quickConnection = new mysql({
  host     : config.server_address,
  port     : config.server_port,
  user     : config.server_username,
  password : config.server_password,
  database : config.db_name
});
let dbEnzymesRaw = quickConnection.query('SELECT * from enzymes;');
let dbEnzymes = {};
for(let i=0; i<dbEnzymesRaw.length; i++) {
  let name = dbEnzymesRaw[i].enzyme;
  let id = dbEnzymesRaw[i].enzymeID;
  dbEnzymes[name] = id;
}

let dbModsRaw = quickConnection.query('SELECT * from unimod;');
let dbMods = {};
for(let i=0; i<dbModsRaw.length; i++) {
  let name = dbModsRaw[i].name;
  let id = dbModsRaw[i].modID;
  dbMods[name] = id;
}

let proteinID = 1;
let sequenceID = 1;
let peptideID = 1;

let proteinWriter = fs.createWriteStream('./sqlFiles/proteins.csv');
let sequenceWriter = fs.createWriteStream('./sqlFiles/sequences.csv');
let peptideWriter = fs.createWriteStream('./sqlFiles/peptides.csv');
let modWriter = fs.createWriteStream('./sqlFiles/mods.csv');

let modDataArray = [];
let peptideDataArray = [];
let sequenceDataArray = [];
let proteinDataArray = [];

const deleteExisting = () => {
  let connection = new mysql({
    host     : config.server_address,
    port     : config.server_port,
    user     : config.server_username,
    password : config.server_password,
    database : config.db_name,
    multipleStatements: true
  });
  let query = 'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE modMap; DROP TABLE unimod; DROP TABLE peptides; DROP TABLE sequences; DROP TABLE proteins; DROP TABLE organisms; DROP TABLE enzymes; SET FOREIGN_KEY_CHECKS = 1;';
  connection.query(query);
}

const createDB = () => {
  let connection = new mysql({
    host     : config.server_address,
    port     : config.server_port,
    user     : config.server_username,
    password : config.server_password,
    database : config.db_name
  });

  // Let's first create our peptides table
  let peptides_creation_command = 
    `CREATE TABLE \`pepDB\`.\`peptides\` (
    \`pepID\` INT NOT NULL AUTO_INCREMENT,
    \`mass\` VARCHAR(45) NOT NULL,
    \`missed_cleavages\` INT NOT NULL,
    \`enzymeID\` INT NOT NULL,
    \`seqID\` INT NOT NULL,
    \`organismID\` INT NOT NULL,
    PRIMARY KEY (\`pepID\`, \`mass\`),
    UNIQUE INDEX \`pepID_UNIQUE\` (\`pepID\` ASC))`;
  connection.query(peptides_creation_command);
  console.log('Created peptides table')

  // Now let's create the sequences table
  let sequences_creation_command = 
    `CREATE TABLE \`pepDB\`.\`sequences\` (
    \`seqID\` INT NOT NULL AUTO_INCREMENT,
    \`sequence\` VARCHAR(100) NOT NULL,
    \`start\` INT NOT NULL,
    \`end\` INT NOT NULL,
    \`length\` INT NOT NULL,
    \`previousAA\` VARCHAR(1) NOT NULL,
    \`nextAA\` VARCHAR(1) NOT NULL,
    \`protID\` INT NOT NULL,
    PRIMARY KEY (\`seqID\`),
    UNIQUE INDEX \`seqID_UNIQUE\` (\`seqID\` ASC))`;

  connection.query(sequences_creation_command);
  console.log('Created sequences table');

  // Now let's create the proteins table
  let proteins_creation_command = 
    `CREATE TABLE \`pepDB\`.\`proteins\` (
    \`protID\` INT NOT NULL AUTO_INCREMENT,
    \`accession\` VARCHAR(128) NOT NULL,
    \`description\` TEXT NULL,
    PRIMARY KEY (\`protID\`),
    UNIQUE INDEX \`protID_UNIQUE\` (\`protID\` ASC))`;
  connection.query(proteins_creation_command);
  console.log('Created proteins table');

  // Now let's create the unimod table
  let unimod_creation_command = 
    `CREATE TABLE \`pepDB\`.\`unimod\` (
    \`modID\` INT NOT NULL AUTO_INCREMENT,
    \`name\` VARCHAR(128) NOT NULL,
    \`massShift\` VARCHAR(45) NOT NULL,
    PRIMARY KEY (\`modID\`),
    UNIQUE INDEX \`modID_UNIQUE\` (\`modID\` ASC))`;
  connection.query(unimod_creation_command);
  console.log('Created unimod table');

  // Now let's create the modMap table
  let modMap_creation_command = 
    `CREATE TABLE \`pepDB\`.\`modMap\` (
    \`pepID\` INT NOT NULL,
    \`modID\` INT NOT NULL,
    PRIMARY KEY (\`pepID\`))`;
  connection.query(modMap_creation_command);
  console.log('Created modMap table');

  // Now let's create the enzymes table
  let enzymes_creation_command = 
    `CREATE TABLE \`pepDB\`.\`enzymes\` (
    \`enzymeID\` INT NOT NULL AUTO_INCREMENT,
    \`enzyme\` VARCHAR(128) NULL,
    PRIMARY KEY (\`enzymeID\`),
    UNIQUE INDEX \`enzymeID_UNIQUE\` (\`enzymeID\` ASC))`;
  connection.query(enzymes_creation_command);
  console.log('Created enzymes table');

  // Now let's create the organisms table
  let organisms_creation_command = 
    `CREATE TABLE \`pepDB\`.\`organisms\` (
    \`organismID\` INT NOT NULL AUTO_INCREMENT,
    \`organism\` VARCHAR(128) NULL,
    PRIMARY KEY (\`organismID\`),
    UNIQUE INDEX \`organismID_UNIQUE\` (\`organismID\` ASC))`;
  connection.query(organisms_creation_command);
  console.log('Created organisms table');

  // Adding the enzymes
  let enzymes = require('./assets/enzymes').enzymes;
  let enzymeQueryList = enzymes.map((e) => {
    return '(\''+e+'\')';
  });
  let enzymeSQL = 'INSERT INTO enzymes (enzyme) VALUES '+enzymeQueryList.join(",");
  connection.query(enzymeSQL);
  console.log('Populated enzymes table');

  // Adding the modifications w/ masses
  let modNames = unimod.listMods();
  let modQueryList = modNames.map((m) => {
    let mod = unimod.getByName(m);
    return '(\''+m+'\',\''+mod.mono_mass+'\')';
  });
  let modSQL = 'INSERT INTO unimod (name, massShift) VALUES '+modQueryList.join(',');
  connection.query(modSQL);
  console.log('Populated unimod table');

  // Now we create the foreign keys
  let fkSQL = 
    `ALTER TABLE peptides
    ADD CONSTRAINT FK_pepToSeq
    FOREIGN KEY (seqID) REFERENCES sequences(seqID)`;
  connection.query(fkSQL);
  console.log('Created peptides to sequences foreign key');

  fkSQL = 
  `ALTER TABLE peptides
  ADD CONSTRAINT FK_pepToEnz
  FOREIGN KEY (enzymeID) REFERENCES enzymes(enzymeID)`;
  connection.query(fkSQL);
  console.log('Created peptides to enzymes foreign key');


  fkSQL = 
  `ALTER TABLE peptides
  ADD CONSTRAINT FK_pepToOrg
  FOREIGN KEY (organismID) REFERENCES organisms(organismID)`;
  connection.query(fkSQL);
  console.log('Created peptides to organisms foreign key');

  fkSQL = 
  `ALTER TABLE sequences
  ADD CONSTRAINT FK_seqToProt
  FOREIGN KEY (protID) REFERENCES proteins(protID)`;
  connection.query(fkSQL);
  console.log('Created sequences to proteins foreign key');

  fkSQL = 
  `ALTER TABLE modMap
  ADD CONSTRAINT FK_modToPep
  FOREIGN KEY (pepID) REFERENCES peptides(pepID)`;
  connection.query(fkSQL);
  console.log('Created modMap to peptides foreign key');

  fkSQL = 
  `ALTER TABLE modMap
  ADD CONSTRAINT FK_modToMod
  FOREIGN KEY (modID) REFERENCES unimod(modID)`;
  connection.query(fkSQL);
  console.log('Created modMap to unimod foreign key');
}

const calculateMass = (sequence, modifications) => {
  const residue_masses = {
    "A": 71.03711,
    "R": 156.10111,
    "N": 114.04293,
    "D": 115.02694,
    "C": 103.00919,
    "E": 129.04259,
    "Q": 128.05858,
    "G": 57.02146,
    "H": 137.05891,
    "I": 113.08406,
    "L": 113.08406,
    "K": 128.09496,
    "M": 131.04049,
    "F": 147.06841,
    "P": 97.05276,
    "S": 87.03203,
    "T": 101.04768,
    "W": 186.07931,
    "Y": 163.06333,
    "V": 99.06841
  };

  const ILLEGAL = [ 'B', 'J', 'O', 'U', 'X', 'Z' ];

  let sequenceList = sequence.split("");

  // For now we don't handle ambiguous symbols, just return nothing
  let overlap = sequenceList.filter(val => -1 !== ILLEGAL.indexOf(val));
  if(overlap.length > 0) {
    return -1;
  }

  let mass = 18.010565;
  for(var i=0; i<sequenceList.length; i++) {
    let residue = sequenceList[i];
    mass += residue_masses[residue];
  }

  for (var i=0; i<modifications.length; i++) {
    let modMass = modifications[i].mass;
    mass += modMass;
  }

  return mass;
  
}

const createCsvString = (arr) => {
  let escapedArr = [];
  for(let i=0; i<arr.length; i++) {
    let item = String(arr[i]);
    item = item.replace(/"/g, '\\"');
    escapedArr.push(item);
  }
  let s = escapedArr.join(",");
  s += "\n";
  return s;
}

const createPeptides = (sequence, numMissed) => {
  let modCombos = pepMod.modify(sequence, config.mods, config.numVariableMods);
  for(let i=0; i<modCombos.length; i++) {
    let mass = calculateMass(sequence, modCombos[i]);
    for(let j=0; j<modCombos[i].length; j++) {
      let modData = createCsvString([peptideID, dbMods[modCombos[i][j].name]]);
      modDataArray.push(modData);
      //modWriter.write(modData);
    }
    let peptideData = createCsvString([peptideID, mass, numMissed, dbEnzymes[config.currentEnzyme], sequenceID, config.organismID]);
    peptideDataArray.push(peptideData);
    //peptideWriter.write({mass: mass, numMissed: numMissed, enzymeID: dbEnzymes[config.currentEnzyme], sequenceID: sequenceID, organismID: config.organismID});
    peptideID++;
  }
}

const createSequences = (sequence) => {
  for(let i=0; i<config.enzymes.length; i++) {
    config.currentEnzyme = config.enzymes[i];
    let digestOptions = {
      enzyme: config.enzymes[i],
      num_missed_cleavages: config.missedCleavages,
      min_length: config.minLength,
      max_length: config.maxLength
    };
    let cutter = new peptideCutter(digestOptions);
    let digestedSequences = cutter.cleave(sequence);
    for(let j=0; j<digestedSequences.length; j++) {
      let pepSeq = digestedSequences[j].sequence;
      let pepStart = digestedSequences[j].start;
      let pepEnd = digestedSequences[j].end;
      let pepMissed = digestedSequences[j].missed;
      let pepLength = pepSeq.length;
      let prevAA = '.';
      let nextAA = '.';
      if(pepStart>0) { prevAA = sequence[pepStart-1]; }
      if(pepEnd<sequence.length-1) { nextAA = sequence[pepEnd+1]; }
      createPeptides(pepSeq, pepMissed);
      let sequenceData = createCsvString([sequenceID, pepSeq, pepStart, pepEnd, pepLength, prevAA, nextAA, proteinID]);
      sequenceDataArray.push(sequenceData);
      //sequenceWriter.write({pepSeq: pepSeq, pepStart: pepStart, pepEnd: pepEnd, pepLength: pepLength, prevAA: prevAA, nextAA: nextAA, proteinID: proteinID});
      sequenceID++;
    }
  }
}

const processProtein = (entry, createDecoy) => {
  let accession = entry.accession;
  let description = entry.description;
  let sequence = entry.sequence;
  if(createDecoy) {
    accession = accession + config.decoyTag;
    sequence = sequence.split("").reverse().join("");
  }
  createSequences(sequence);
  let proteinData = createCsvString([proteinID, accession, description]);
  proteinDataArray.push(proteinData);
  //proteinWriter.write({accession: accession, description: description});
  proteinID++;
}

console.log("Starting...");

console.log("Removing existing...");
deleteExisting();

console.log("Starting from a blank slate...");
createDB();

for(let i=0; i<config.fastaFiles.length; i++) {
  let organismName = config.fastaFiles[i].organism;
  let fileName = config.fastaFiles[i].file;

  let quickConnection = new mysql({
    host     : config.server_address,
    port     : config.server_port,
    user     : config.server_username,
    password : config.server_password,
    database : config.db_name
  });
  let organismSQL = 'INSERT INTO organisms (organism) VALUES(?)';
  let organismResults = quickConnection.query(organismSQL, [organismName]);
  config.organismID = organismResults['insertId'];

  console.log(`\nProcessing organism: ${organismName}`);
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

  for(let j=0; j<fastaEntries.length; j++) {
    if(count%interval===0) {
      let progress = numIntervalsElapsed * (100/numIntervalsTotal);
      process.stdout.write(progress+"% ");
      numIntervalsElapsed++;
    }
    count++;
    let entry = fastaEntries[j];
    processProtein(entry, false);
    if(config.createDecoys) {
      processProtein(entry, true);
    }
  } 
  process.stdout.write("\n");
}

console.log('Writing files...');
proteinWriter.write(proteinDataArray.join(""));
sequenceWriter.write(sequenceDataArray.join(""));
peptideWriter.write(peptideDataArray.join(""));
modWriter.write(modDataArray.join(""));

proteinWriter.end();
sequenceWriter.end();
peptideWriter.end();
modWriter.end();

console.log("Saving to database...");
let proteinInsert = "LOAD DATA LOCAL INFILE '/home/mike/github/msdb/sqlFiles/proteins.csv' INTO TABLE proteins;"


let thing = quickConnection.query(proteinInsert);
console.log(thing);

console.log("\nDone!\n");


