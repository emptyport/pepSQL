peptideCutter = require('peptide-cutter');
pepMod = require('peptide-modifier');

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

const createSequences = (sequence, config, accession, organism) => {
  let sequenceEntries = [];
  for(let i=0; i<config.enzymes.length; i++) {
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
      let modCombos = pepMod.modify(pepSeq, config.mods, config.numVariableMods);
      for(let k=0; k<modCombos.length; k++) {
        let mass = calculateMass(pepSeq, modCombos[k]);

        sequenceEntries.push([
          mass,
          pepSeq,
          pepMissed,
          config.enzymes[i],
          prevAA,
          nextAA,
          pepLength,
          accession,
          organism,
          JSON.stringify(modCombos[k])
        ]);
      }
    }
  }
  return sequenceEntries;
}


module.exports.processProtein = (entry, config, organism, createDecoy) => {
  let accession = entry.accession;
  let description = entry.description;
  let sequence = entry.sequence;
  if(createDecoy) {
    accession = accession + config.decoyTag;
    sequence = sequence.split("").reverse().join("");
  }
  let sequenceEntries = createSequences(sequence, config, accession, organism);
  return sequenceEntries;
}

module.exports.createCsvString = (arr) => {
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