var unimod = require('js-unimod');
var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var fastaParser = require('fasta-js');
let Q = require('q');

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

  connection.connect(function(err) {
    if (err) {
      return_status.msg = "Error connecting to MySQL database: "+err.stack;
      res.send(return_status);
      return;
    }
    console.log('connected as id ' + connection.threadId);

    let fastaOptions = {
      'definition': 'gi|accession|description',
      'delimiter': '|'
    };

    // Add the organism
    let organismSQL = 'INSERT INTO organisms (organism) VALUES(?)';
    connection.query(organismSQL, [req.body.organismName], function(error, results, fields) {
      if(error) throw error;
      console.log("results");
      console.log(results);
      console.log("fields");
      console.log(fields);
    });

    let fasta = new fastaParser(fastaOptions);
    let sequences = fasta.parse(req.body.fastaData);

    addOrganism('yeast').then(addProtein('hello protein'));

    connection.end();
    return_status.msg = 'Process complete';
    return_status.status = 200;
    res.send(return_status);
    return;
  });
});

router.post('/truncate', function(req, res, next) {
  var connection = mysql.createConnection({
    host     : req.body.server_address,
    port     : req.body.server_port,
    user     : req.body.server_username,
    password : req.body.server_password,
    database : 'pepDB',
    multipleStatements: true
  });
  let query = 'TRUNCATE TABLE peptides; TRUNCATE TABLE sequences; TRUNCATE TABLE proteins; TRUNCATE TABLE modMap; TRUNCATE TABLE organisms; TRUNCATE TABLE enzymes; TRUNCATE TABLE unimod;';
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
      UNIQUE INDEX \`pepID_UNIQUE\` (\`pepID\` ASC)))`;
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

    let modNames = unimod.listMods();
    let modQueryList = modNames.map((m) => {
      let mod = unimod.getByName(m);
      return '(\''+m+'\',\''+mod.mono_mass+'\')';
    });
    let modSQL = 'INSERT INTO unimod (name, massShift) VALUES '+modQueryList.join(',');
    runCreationCommand(connection, modSQL);
    console.log('Populated unimod table');

    
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
