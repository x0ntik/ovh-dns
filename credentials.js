const ovh = require('ovh')({
  endpoint: 'ovh-eu',
  appKey: 'QhINMgIEGOu4zjDS',
  appSecret: 'DsPDNJcOCgHkzHrYy1kpf9RoiRaPKn9y'
});

ovh.request('POST', '/auth/credential', {
  'accessRules': [
    { 'method': 'GET', 'path': '/*'},
    { 'method': 'POST', 'path': '/*'},
    { 'method': 'PUT', 'path': '/*'},
    { 'method': 'DELETE', 'path': '/*'}
  ]
}, function (error, credential) {
  console.log(error || credential);
});
