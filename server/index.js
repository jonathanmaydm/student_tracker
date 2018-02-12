const express = require('express'),
  cors = require('cors'),
  { json } = require('body-parser'),
  session = require('express-session'),
  massive = require('massive'),
  passport = require('passport'),
  axios = require('axios'),
  path = require('path'),
  { Strategy: DevmtnStrategy } = require('devmtn-auth'),
  devMtnPassport = new passport.Passport(),
  syncStudents = require('./studentSyncCronJob');
require('dotenv').config();

const app = express();
const port = process.env.DEV_PORT;
const configPath = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const {
  connectionString,
  sessionConfig,
  devmtnAuth,
  auth_redirect,
  authHeaders
} = require(`../configs/${configPath}.config`);
const masterRoutes = require('./masterRoutes');

app.use(cors());
app.use(json());
app.use(session(sessionConfig));

massive(connectionString)
  .then(dbInstance => {
    app.set('db', dbInstance);
  })
  .catch(err => console.log('Failed to connect to Postgres DataBase: ', err));

devMtnPassport.use(
  'devmtn',
  new DevmtnStrategy(devmtnAuth, (jwtoken, user, done) => {
    const db = app.get('db');

    return db.dm_users.addUser(user).then(dbUser => {
      dbUser[0].roles = user.roles;
      done(null, dbUser[0]);
    });
    // db.dm_users.getUser([user.id]).then(dbUser => done(null, dbUser[0]));
    // return done(null, user);
  })
);

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((user, done) => done(null, user));

app.use(devMtnPassport.initialize());

app.use(passport.initialize());
app.use(passport.session());

app.get(
  '/auth/devmtn',
  (req, res, next) => {
    req.session.redirect = req.query.redirect
      ? req.query.redirect.replace(/\//, '')
      : '';
    next();
  },
  devMtnPassport.authenticate('devmtn')
);
app.get(
  '/auth/devmtn/callback',
  devMtnPassport.authenticate('devmtn', { failureRedirect: '/loginFailed' }),
  (req, res) => {
    axios
      .get(
        `https://devmountain.com/api/mentors/${
          req.user.devmountain_id
        }/classsessions`,
        authHeaders
      )
      .then(sessionResponse => {
        /**
         * Currently only adding sesssion id and short_name,
         * however in the future if there is any other information
         *  that is needed about the classes that the mentor/instructor
         * was over, this is where we'd want to add it.
         */
        const sessions = sessionResponse.data.map(userSession => ({
          id: userSession.id,
          name: userSession.short_name
        }));
        req.session.devmtnUser = Object.assign({}, req.user, { sessions });
        return res.redirect(`${auth_redirect}${req.session.redirect}`);
      })
      .catch(err => console.log('Cannot get sessions: ', err));
  }
);

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(auth_redirect);
  });
});

// app.use('*', authMiddleware);

masterRoutes(app);
syncStudents(app);

switch (process.env.npm_lifecycle_event) {
case 'build':
  break;
case 'start':
  break;
default:
  app.use('/', express.static(`${__dirname}/../build`));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '/../build/index.html'));
  });
}

app.listen(port, () => {
  console.log('Server listening on port', port);
});
