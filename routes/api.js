let unimod = require('js-unimod');
let express = require('express');
let router = express.Router();
let mysql = require('sync-mysql'); // Asynchronicity can shove it for now. Maybe at some point I'll make the SQL stuff async
let fastaParser = require('fasta-js');
let peptideCutter = require('peptide-cutter');

const BATCH_SIZE = 5000;

/*


function createEntries(res, connection, data, sequenceData, shouldCreateDecoy, dbEnzymes, dbMods) {
  let return_status = {
    'msg':'Error creating entries',
    'code': 400
  }

  let deferred = Q.defer();
  let sequence = sequenceData.sequence;
  let description = sequenceData.description;
  let accession = sequenceData.accession;
  if(shouldCreateDecoy) {
    accession = accession + data.decoyTag;
    sequence = sequence.split("").reverse().join("");
  }
  let proteinSQL = 'INSERT INTO proteins (accession, description) VALUES (\''+accession+'\','+connection.escape(description)+')';
  connection.query(proteinSQL, function(error, results, fields) {
    if(error) {
      console.log(error);
      return_status.msg = "Error adding protein "+accession;
      res.send(return_status);
      return;
    };
    proteinID = results['insertId'];

    
        let sequenceSQL = `INSERT INTO sequences (sequence, start, end, length, previousAA, nextAA, protID) VALUES ('${pepSeq}','${pepStart}','${pepEnd}','${pepLength}','${prevAA}','${nextAA}','${proteinID}');`;
        connection.query(sequenceSQL, function(seqError, seqResults) {
          if(seqError) {
            console.log(seqError);
            console.log(sequenceSQL);
            return_status.msg = "Error adding sequence "+pepSeq;
            res.send(return_status);
            return;
          }
          seqID = seqResults['insertId'];





          deferred.resolve();

        });
      }


    }



  });
  

  return deferred.promise;
}
*/

function processProtein(fastaEntry, isDecoy, data) {
  let proteinList = [];
  let sequenceList = [];
  let peptideList = [];
  let modList = [];

  let sequence = fastaEntry.sequence;
  let accession = fastaEntry.accession;
  let description = fastaEntry.description;
  if(isDecoy) {
    sequence = sequence.split("").reverse().join("");
    accession = accession + data.decoyTag;
  }

  proteinList.push({
    accession: accession,
    description: description
  });

  let minLength = parseInt(data.minLength);
  let maxLength = parseInt(data.maxLength);
  let allowedMissed = parseInt(data.missedCleavages);
  let enzymes = data.enzymeList;
  for(let i=0; i<enzymes.length; i++) {
    let enzyme = enzymes[i];
    let options = {
      enzyme: enzyme,
      num_missed_cleavages: allowedMissed,
      min_length: minLength,
      max_length: maxLength
    };
    let cutter = new peptideCutter(options);
    let digestedSequences = cutter.cleave(sequence);
    sequenceList.push(digestedSequences);
    
  }
}

router.post('/add', function(req, res, next) {

  let connection = new mysql({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB'
  });

  let dbEnzymesRaw = connection.query('SELECT * from enzymes;');
  let dbEnzymes = {};
  for(let i=0; i<dbEnzymesRaw.length; i++) {
    let name = dbEnzymesRaw[i].enzyme;
    let id = dbEnzymesRaw[i].enzymeID;
    dbEnzymes[name] = id;
  }

  let dbModsRaw = connection.query('SELECT * from unimod;');
  let dbMods = {};
  for(let i=0; i<dbModsRaw.length; i++) {
    let name = dbModsRaw[i].name;
    let id = dbModsRaw[i].modID;
    dbMods[name] = id;
  }
  
  // Add the organism
  let organismSQL = 'INSERT INTO organisms (organism) VALUES(?)';
  let organismResults = connection.query(organismSQL, [req.body.organismName]);
  req.body.organismID = organismResults['insertId'];

  let fastaOptions = {
    'definition': 'gi|accession|description',
    'delimiter': '|'
  };
  let fasta = new fastaParser(fastaOptions);
  let sequences = fasta.parse(req.body.fastaData);
  let length = sequences.length;
  delete req.body.fastaData;

  const TOTAL = req.body.enzymeList.length * length;

  let proteinQueue = [];
  let sequenceQueue = [];
  let peptideQueue = [];
  let modQueue = [];

  for(let i=0; i<length; i++) {
    let sequence = sequences[i];
    let dataToAdd = processProtein(sequence, false, req.body);
    proteinQueue.push(dataToAdd.proteins);
    sequenceQueue.push(dataToAdd.sequences);
    peptideQueue.push(dataToAdd.peptides);
    modQueue.push(dataToAdd.mods);

    if(req.body.createDecoys === 'true') {
      let dataToAdd = processProtein(sequence, true, req.body);
      proteinQueue.push(dataToAdd.proteins);
      sequenceQueue.push(dataToAdd.sequences);
      peptideQueue.push(dataToAdd.peptides);
      modQueue.push(dataToAdd.mods);
    }
    
    let enzymes = req.body.enzymeList;
    for(let j=0; j<enzymes.length; j++) {
      let enzyme = enzymes[j];
      let options = {
        enzyme: enzyme,
        num_missed_cleavages: allowedMissed,
        min_length: minLength,
        max_length: maxLength
      };
      let cutter = new peptideCutter(options);
      let digestedSequences = cutter.cleave(seq);
      sequenceQueue.push(digestedSequences);
      if(req.body.createDecoys === 'true') {
        reversedDigestedSequences = cutter.cleave(seq.split("").reverse().join(""));
        sequenceQueue.push(reversedDigestedSequences);
        digestedSequences = digestedSequences.concat(reversedDigestedSequences);
      }




      for(let k=0; k<peptides.length; k++) {
        let pepSeq = peptides[k].sequence;
        let pepStart = peptides[k].start;
        let pepEnd = peptides[k].end;
        let pepMissed = peptides[k].missed;
        let pepLength = pepSeq.length;
        let prevAA = '.';
        let nextAA = '.';
        if(pepStart>0) { prevAA = sequence[pepStart-1]; }
        if(pepEnd<sequence.length-1) { nextAA = sequence[pepEnd+1]; }

  }
      
  let return_status = {};
  return_status.msg = "Process complete";
  return_status.status = 200;
  res.send(return_status);
});

router.post('/delete', function(req, res, next) {
  let connection = new mysql({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB',
    multipleStatements: true
  });
  let query = 'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE modMap; DROP TABLE unimod; DROP TABLE peptides; DROP TABLE sequences; DROP TABLE proteins; DROP TABLE organisms; DROP TABLE enzymes; SET FOREIGN_KEY_CHECKS = 1;';
  connection.query(query);
  res.send({status: 200});
});

router.post('/dbcreate', function(req, res, next) {
  // Setting up the connection to MySQL
  console.log(req.body);
  let connection = new mysql({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB'
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
  let enzymes = require('../assets/enzymes').enzymes;
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
  
  let return_status={};
  return_status.msg = 'Database ready';
  return_status.code = 200;
  res.send(return_status);
});

module.exports = router;
