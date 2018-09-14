var express = require('express');
var router = express.Router();
var unimod = require('js-unimod');

let modification_names = unimod.listMods();
let modifications = [];
for(let i=0; i<modification_names.length; i++) {
  let name = modification_names[i];
  let mod = unimod.getByName(name);
  modifications.push({
    name: name,
    mass: mod.mono_mass
  });
}

let enzymes = require('../assets/enzymes').enzymes;

let amino_acids = [
  'A',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'K',
  'L',
  'M',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'V',
  'W',
  'Y'
];

let residues = [];
for(let i=0; i<amino_acids.length; i++) {
  let aa = amino_acids[i];
  residues.push({
    value: aa,
    display: aa
  });
  residues.push({
    value: '['+aa,
    display: aa+' N-term'
  });
  residues.push({
    value: aa+']',
    display: aa+' C-term'
  });
}
residues.push({
  value: '[',
  display: 'Any N-term'
});
residues.push({
  value: ']',
  display: 'Any C-term'
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/add', function(req, res, next) {
  res.render('add', { title: 'Add Entries', enzyme_list: enzymes, modification_list: modifications, residue_list: residues });
});

router.get('/manage', function(req, res, next) {
  res.render('manage', { title: 'Manage' });
});

module.exports = router;
