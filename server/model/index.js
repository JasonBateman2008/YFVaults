const fs        = require('fs');
const path      = require('path');
const Sequelize = require('sequelize');

const database = 'defi';
const username = 'defi';
const password = 'defi';

const sequelize = new Sequelize(database, username, password, {
  host: 'localhost',
	logging: process.env.NODE_ENV === 'development' ? console.log : false,
	define: {
		freezeTableName: true,
		underscored: true,
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: true
  },
	pool:{
		max:30
	},
	dialect: 'postgres'
});

const basename  = path.basename(__filename);
const db        = {};

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize);
    const name = model.name.split('_').map(n => n.substring(0, 1).toUpperCase() + n.substring(1));

    db[name.join('')] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
