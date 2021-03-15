const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const helmet = require('helmet');

// Application
const app = express();

// Trust the nth hop from the front-facing proxy server as the client
app.set('trust proxy', 1);

// Helmet helps you secure your Express apps by setting various HTTP headers
app.use(helmet());

app.use(logger('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/v1', require('./routes'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
