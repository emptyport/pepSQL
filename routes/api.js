let unimod = require('js-unimod');
let express = require('express');
let router = express.Router();
let mysql = require('mysql');
let syncMysql = require('sync-mysql');
let fastaParser = require('fasta-js');
let peptideCutter = require('peptide-cutter');
let Q = require('q');

const BATCH_SIZE = 5000;

function addOrganism(organism) {
  let deferred = Q.defer();
  console.log(organism);
  deferred.resolve(1);
  return deferred.promise;
}

function addProtein(protein) {
  let deferred = Q.defer();
  console.log(protein);
  deferred.resolve("success");
  return deferred.promise;
}

async function runCreationCommand(connection, cmd) {
  await connection.query(cmd, function (error, results, fields) {
    if (error) return false;
    return true;
  });
}

function cleanUp(connection, res) {
  let return_status = {};
  connection.end(function(err) {
    if (err) {
      return_status.msg = "Error closing connection";
      return_status.status = 400;
      return return_status;
    }
    console.log("\nDone!\n");
    return_status.msg = 'Process complete';
    return_status.status = 200;
    res.send(return_status);
  });
}

function processFasta(connection, data, res, dbEnzymes, dbMods) {
  let deferred = Q.defer();
  let fastaOptions = {
    'definition': 'gi|accession|description',
    'delimiter': '|'
  };
  let fasta = new fastaParser(fastaOptions);
  let sequences = fasta.parse(data.fastaData);
  delete data.fastaData;
  let length = sequences.length;
  for(let i=0; i<length; i++) {
    createEntries(res, connection, data, sequences[i], false, dbEnzymes, dbMods)
    .then(function() {
      console.log('finished '+i);
      if(i===length-1 && data.createDecoys !== 'true') { cleanUp(connection, res); deferred.resolve(); }
    });
    if(data.createDecoys === 'true') {
      createEntries(res, connection, data, sequences[i], true, dbEnzymes, dbMods)
      .then(function() {
        console.log('finished decoy '+i);
        if(i===length-1) { cleanUp(connection, res); deferred.resolve(); }
      });
    }
  }
  return deferred.promise;
}

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
      let peptides = cutter.cleave(sequence);
      for(let j=0; j<peptides.length; j++) {
        let pepSeq = peptides[j].sequence;
        let pepStart = peptides[j].start;
        let pepEnd = peptides[j].end;
        let pepMissed = peptides[j].missed;
        let pepLength = pepSeq.length;
        let prevAA = '.';
        let nextAA = '.';
        if(pepStart>0) { prevAA = sequence[pepStart-1]; }
        if(pepEnd<sequence.length-1) { nextAA = sequence[pepEnd+1]; }
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

router.post('/add', function(req, res, next) {
  let return_status = {
    msg: 'Unknown failure',
    status: 400
  };

  var connection = mysql.createConnection({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB'
  });

  let syncConnection = new syncMysql({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB'
  });
  let dbEnzymesRaw = syncConnection.query('SELECT * from enzymes;');
  let dbEnzymes = {};
  for(let i=0; i<dbEnzymesRaw.length; i++) {
    let name = dbEnzymesRaw[i].enzyme;
    let id = dbEnzymesRaw[i].enzymeID;
    dbEnzymes[name] = id;
  }

  let dbModsRaw = syncConnection.query('SELECT * from unimod;');
  let dbMods = {};
  for(let i=0; i<dbModsRaw.length; i++) {
    let name = dbModsRaw[i].name;
    let id = dbModsRaw[i].modID;
    dbMods[name] = id;
  }
  
  connection.connect(function(err) {
    if (err) {
      return_status.msg = "Error connecting to MySQL database: "+err.stack;
      res.send(return_status);
      return;
    }
    console.log('connected as id ' + connection.threadId);



    // Add the organism
    let organismSQL = 'INSERT INTO organisms (organism) VALUES(?)';
    connection.query(organismSQL, [req.body.organismName], function(error, results, fields) {
      if(error) {
        return_status.msg = "Error adding organism";
        res.send(return_status);
        return;
      };
      req.body.organismID = results['insertId'];
      
      processFasta(connection, req.body, res, dbEnzymes, dbMods)
      .then(function() {
        console.log("nearly done");
      });
    });
    
    return;
  });
});

router.post('/delete', function(req, res, next) {
  var connection = mysql.createConnection({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB',
    multipleStatements: true
  });
  let query = 'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE modMap; DROP TABLE unimod; DROP TABLE peptides; DROP TABLE sequences; DROP TABLE proteins; DROP TABLE organisms; DROP TABLE enzymes; SET FOREIGN_KEY_CHECKS = 1;';
  connection.query(query, function (error, results, fields) {
    if (error) {
      console.log(error);
      res.send({status: 400});
      return;
    };
    res.send({status: 200});
  });
});

router.post('/dbcreate', function(req, res, next) {
  // Setting up the connection to MySQL
  console.log(req.body);
  var connection = mysql.createConnection({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB'
  });
   
  connection.connect(function(err) {
    // We start with a failing message and progressively make it successful
    let return_status = {
      'msg':'Error connecting',
      'code': 400
    }
    if (err) {
      console.error('error connecting: ' + err.stack);
      res.send(return_status);
      return;
    }
   
    console.log('connected as id ' + connection.threadId);

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
    if(!runCreationCommand(connection, peptides_creation_command)) {
      return_status.msg = 'Error creating peptides table';
      res.send(return_status);
    }
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

    if(!runCreationCommand(connection, sequences_creation_command)) {
      return_status.msg = 'Error creating sequences table';
      res.send(return_status);
    }
    console.log('Created sequences table');

    // Now let's create the proteins table
    let proteins_creation_command = 
      `CREATE TABLE \`pepDB\`.\`proteins\` (
      \`protID\` INT NOT NULL AUTO_INCREMENT,
      \`accession\` VARCHAR(128) NOT NULL,
      \`description\` TEXT NULL,
      PRIMARY KEY (\`protID\`),
      UNIQUE INDEX \`protID_UNIQUE\` (\`protID\` ASC))`;

    if(!runCreationCommand(connection, proteins_creation_command)) {
      return_status.msg = 'Error creating proteins table';
      res.send(return_status);
    }
    console.log('Created proteins table');

    // Now let's create the unimod table
    let unimod_creation_command = 
      `CREATE TABLE \`pepDB\`.\`unimod\` (
      \`modID\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(128) NOT NULL,
      \`massShift\` VARCHAR(45) NOT NULL,
      PRIMARY KEY (\`modID\`),
      UNIQUE INDEX \`modID_UNIQUE\` (\`modID\` ASC))`;
    
    if(!runCreationCommand(connection, unimod_creation_command)) {
      return_status.msg = 'Error creating unimod table';
      res.send(return_status);
    }
    console.log('Created unimod table');

    // Now let's create the modMap table
    let modMap_creation_command = 
      `CREATE TABLE \`pepDB\`.\`modMap\` (
      \`pepID\` INT NOT NULL,
      \`modID\` INT NOT NULL,
      PRIMARY KEY (\`pepID\`))`;
    
    if(!runCreationCommand(connection, modMap_creation_command)) {
      return_status.msg = 'Error creating modMap table';
      res.send(return_status);
    }
    console.log('Created modMap table');

    // Now let's create the enzymes table
    let enzymes_creation_command = 
      `CREATE TABLE \`pepDB\`.\`enzymes\` (
      \`enzymeID\` INT NOT NULL AUTO_INCREMENT,
      \`enzyme\` VARCHAR(128) NULL,
      PRIMARY KEY (\`enzymeID\`),
      UNIQUE INDEX \`enzymeID_UNIQUE\` (\`enzymeID\` ASC))`;
    
    if(!runCreationCommand(connection, enzymes_creation_command)) {
      return_status.msg = 'Error creating enzymes table';
      res.send(return_status);
    }
    console.log('Created enzymes table');

    // Now let's create the organisms table
    let organisms_creation_command = 
      `CREATE TABLE \`pepDB\`.\`organisms\` (
      \`organismID\` INT NOT NULL AUTO_INCREMENT,
      \`organism\` VARCHAR(128) NULL,
      PRIMARY KEY (\`organismID\`),
      UNIQUE INDEX \`organismID_UNIQUE\` (\`organismID\` ASC))`;
    
    if(!runCreationCommand(connection, organisms_creation_command)) {
      return_status.msg = 'Error creating organisms table';
      res.send(return_status);
    }
    console.log('Created organisms table');

    // Adding the enzymes
    let enzymes = require('../assets/enzymes').enzymes;
    let enzymeQueryList = enzymes.map((e) => {
      return '(\''+e+'\')';
    });
    let enzymeSQL = 'INSERT INTO enzymes (enzyme) VALUES '+enzymeQueryList.join(",");
    runCreationCommand(connection, enzymeSQL);
    console.log('Populated enzymes table');

    // Adding the modifications w/ masses
    let modNames = unimod.listMods();
    let modQueryList = modNames.map((m) => {
      let mod = unimod.getByName(m);
      return '(\''+m+'\',\''+mod.mono_mass+'\')';
    });
    let modSQL = 'INSERT INTO unimod (name, massShift) VALUES '+modQueryList.join(',');
    runCreationCommand(connection, modSQL);
    console.log('Populated unimod table');

    // Now we create the foreign keys
    let fkSQL = 
      `ALTER TABLE peptides
      ADD CONSTRAINT FK_pepToSeq
      FOREIGN KEY (seqID) REFERENCES sequences(seqID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating pepToSeq FK';
      res.send(return_status);
    }
    console.log('Created peptides to sequences foreign key');

    fkSQL = 
    `ALTER TABLE peptides
    ADD CONSTRAINT FK_pepToEnz
    FOREIGN KEY (enzymeID) REFERENCES enzymes(enzymeID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating pepToEnz FK';
      res.send(return_status);
    }
    console.log('Created peptides to enzymes foreign key');


    fkSQL = 
    `ALTER TABLE peptides
    ADD CONSTRAINT FK_pepToOrg
    FOREIGN KEY (organismID) REFERENCES organisms(organismID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating pepToOrg FK';
      res.send(return_status);
    }
    console.log('Created peptides to organisms foreign key');

    fkSQL = 
    `ALTER TABLE sequences
    ADD CONSTRAINT FK_seqToProt
    FOREIGN KEY (protID) REFERENCES proteins(protID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating seqToProt FK';
      res.send(return_status);
    }
    console.log('Created sequences to proteins foreign key');

    fkSQL = 
    `ALTER TABLE modMap
    ADD CONSTRAINT FK_modToPep
    FOREIGN KEY (pepID) REFERENCES peptides(pepID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating modToPep FK';
      res.send(return_status);
    }
    console.log('Created modMap to peptides foreign key');

    fkSQL = 
    `ALTER TABLE modMap
    ADD CONSTRAINT FK_modToMod
    FOREIGN KEY (modID) REFERENCES unimod(modID)`;
    if(!runCreationCommand(connection, fkSQL)) {
      return_status.msg = 'Error creating modToMod FK';
      res.send(return_status);
    }
    console.log('Created modMap to unimod foreign key');
    
    connection.end(function(err) {
      if (err) {
        return_status.msg = "Error closing connection";
        return return_status;
      }
      return_status.msg = 'Database ready';
      return_status.code = 200;
      res.send(return_status);
    });
    
    

    
  });
});

module.exports = router;
