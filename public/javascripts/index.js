function submit_manage_form() {
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