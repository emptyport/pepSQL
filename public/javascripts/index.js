function submitManageForm() {
  var server_address = $("#server_address").val();
  var server_port = $("#server_port").val();
  var server_username = $("#server_username").val();
  var server_password = $("#server_password").val();
  var data = {
    server_address: server_address,
    server_port: server_port,
    server_username: server_username,
    server_password: server_password
  };
  $.post('/api/dbcreate', data, function(result) {
    console.log(result);
    alert(result.msg);
  });
}

function addEntries() {
  let fixedMods = [];
  let variableMods = [];

  $('#fixedMods tr').each(function(i, row) {
    if(i>0) {
      let curRow = $(row);
      let name = curRow.find('td').eq(0).children('.mod-select.selectized').val()[0];
      let residues = curRow.find('td').eq(1).children('.res-select.selectized').val();
      if(name !== undefined && residues.length > 0) {
        fixedMods.push({
          name: name,
          residues: residues
        });
      }
    }
  });

  $('#variableMods tr').each(function(i, row) {
    if(i>0) {
      let curRow = $(row);
      let name = curRow.find('td').eq(0).children('.mod-select.selectized').val()[0];
      let residues = curRow.find('td').eq(1).children('.res-select.selectized').val();

      if(name !== undefined && residues.length > 0) {
        variableMods.push({
          name: name,
          residues: residues
        });
      }
    }
  });


  let payload = {
    server_address: $('#server-address').val(),
    server_port: $('#server-port').val(),
    server_username: $('#server-username').val(),
    server_password: $('#server-password').val(),
    organismName: $('#organismName').val(),
    createDecoys: $('#createDecoys').is(":checked"),
    decoyTag: $('#decoyTag').val(),
    minLength: $('#minLength').val(),
    maxLength: $('#maxLength').val(),
    missedCleavages: $('#missedCleavages').val(),
    enzymeList: $('#enzyme-selection').val(),
    fixedMods: fixedMods,
    variableMods: variableMods,
    fastaData: ''
  };

  let reader = new FileReader();

  reader.onload = function(e) {
    let fastaText = reader.result;
    payload.fastaData = fastaText;
    $.post('/api/add', payload, function(result) {
      console.log(result);
      alert(result.msg);
    });
  }

  let file = document.getElementById('fastaUpload').files[0];
  reader.readAsText(file);


}







$(function() {
  $('#enzyme-selection').selectize({
    plugins: ['remove_button']
  });

  $('.mod-select').selectize({
    maxItems: 1
  });

  $('.res-select').selectize({
    plugins: ['remove_button']
  });
});

$(document).ready(function() {
  document.getElementById("page-container").style.visibility = "visible";
  document.getElementById("loading").style.visibility = "hidden";
  document.getElementById("loading").style.height = "0px";
  document.getElementById("loading").innerHTML = "";
});