var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/add', function(req, res, next) {
  res.render('add', { title: 'Add Entries' });
});

router.get('/manage', function(req, res, next) {
  res.render('manage', { title: 'Manage' });
});

module.exports = router;
