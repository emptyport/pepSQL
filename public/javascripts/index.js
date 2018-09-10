function submit_manage_form() {
  var server_address = document.getElementById("server_address").value;
  var server_port = document.getElementById("server_port").value;
  var server_username = document.getElementById("server_username").value;
  var server_password = document.getElementById("server_password").value;
  var data = {
    server_address: server_address,
    server_port: server_port,
    server_username: server_username,
    server_password: server_password
  };
  $.post('/api/dbcreate', data, function(result) {console.log(result);});
 
}

function success() {
  alert("db created");
}