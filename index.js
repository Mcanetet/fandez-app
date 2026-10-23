require('dotenv').config();

console.log('=== Fandez arrancando ===');
console.log('Node:', process.version);
console.log('PORT:', process.env.PORT || '(default 3000)');
console.log('DB_HOST:', process.env.DB_HOST || '(no definido)');
console.log('DB_NAME:', process.env.DB_NAME || '(no definido)');

const store = require('./models/store');
require('./lib/referralsRuntime').install(store);

require('./app.js');
