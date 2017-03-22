import bunyan from 'bunyan';
import express from 'express';
import Promise from 'bluebird';
import moment from 'moment';

import * as tour2017Client from '../common/tour2017Client';

const log = bunyan.createLogger({ name: 'lizard' });

const router = express.Router();

/**
 * Fetches the api credentials to use when authenticating with the winking
 * lizard api.
 */
const fetchApiCredentialPromise = ({
  db,
  userId,
}) => {
  log.info('tour2017 - fetchApiCredentialPromise - start');
  return new Promise((resolve, reject) => {
    db.drunken_lizard.winking_lizard.findOne({
      tour_year: 2017,
      user_account_id: userId,
    }, (err, credential) => {
      if (err || !credential) {
        log.info('tour2017 - fetchApiCredentialPromise - error');
        return reject(err);
      }
      log.info('tour2017 - fetchApiCredentialPromise - success');
      return resolve(credential.credentials);
    });
  });
};

const fetchBeers = ({
  db,
  tourYear,
  userId,
}) => {
  log.info('tour2017 - fetchBeers - start');
  return new Promise((resolve, reject) => {
    db.run('select b.beer_id as "beerId", b.name, b.description, '
      + '  case coalesce(cb.beer_id, -1) when -1 then false '
      + '    else true '
      + 'end as consumed '
      + 'from drunken_lizard.beer b left outer join drunken_lizard.consumed_beer cb '
      + 'on b.beer_id = cb.beer_id '
      + 'where (cb.user_account_id = $1 or cb.user_account_id is null) '
      + 'and b.tour_year = $2', [userId, tourYear], (err, results) => {
        if (err) {
          log.info('tour2017 - fetchBeers - error');
          return reject(err);
        }
        log.info(`tour2017 - fetchBeers - success(${results.length})`);
        return resolve(results);
      });
  });
};

const fetchBeersConsumed = ({
  db,
  tourYear,
}) => {

};

/**
 * Fetches the beers for a tour.
 *
 * return A set of tour beer id's.
 */
const fetchBeerIdsPromise = ({
  db,
  tourYear,
}) => {
  log.info('tour2017 - fetchBeersPromise - start');
  return new Promise((resolve, reject) => {
    db.drunken_lizard.beer.find({
      tour_year: tourYear,
    }, (err, beers) => {
      if (err) {
        log.info('tour2017 - fetchBeersPromise - error');
        return reject(err);
      }
      const beerIds = [];
      beers.forEach((beer) => {
        beerIds.push(parseInt(beer.tour_item_id, 10));
      });
      log.info(`tour2017 - fetchBeersPromise - success(${beerIds.length})`);
      return resolve(beerIds);
    });
  });
};

/**
 * Fetches the beers a used has consumed.
 *
 * return A set of tour beer id's.
 */
const fetchBeersConsumedPromise = ({
  db,
  tourYear,
  userId,
}) => {
  log.info('tour2017 - fetchBeersConsumedPromise - start');
  return new Promise((resolve, reject) => {
    db.run('select b.tour_item_id from drunken_lizard.consumed_beer cb '
      + 'inner join drunken_lizard.beer b on cb.beer_id = b.beer_id '
      + 'where b.tour_year = $1 and cb.user_account_id = $2',
      [tourYear, userId],
      (err, results) => {
        if (err) {
          log.info('tour2017 - fetchBeersConsumedPromise - error');
          return reject(err);
        }
        const consumedBeerIds = [];
        results.forEach((beer) => {
          consumedBeerIds.push(parseInt(beer.tour_item_id, 10));
        });
        log.info(`tour2017 - fetchBeersConsumedPromise - success(${consumedBeerIds.length})`);
        return resolve(consumedBeerIds);
      });
  });
};

/**
 * Inserts all the beers.
 */
const saveBeersPromise = ({
  beers,
  db,
}) => {
  log.info('tour2017 - saveBeersPromise - start');
  return new Promise((resolve) => {
    const beerInsertionPromises = beers.map((beer) => {
      const tourNumber = Number.isInteger(beer.ItemName.substring(0, 3)) ?
        beer.ItemName.substring(0, 3) : -1;
      return new Promise((resolve, reject) => {
        db.drunken_lizard.beer.save({
          description: beer.ItemDesc,
          name: beer.ItemName,
          tour_beer_number: tourNumber,
          tour_data: beer,
          tour_description: beer.ItemDesc,
          tour_item_id: beer.ItemID,
          tour_name: beer.ItemName,
          tour_year: '2017',
          created_dtm: moment().format(),
          last_modified_dtm: moment().format(),
          last_accessed_dtm: moment().format(),
        }, (err, inserted) => {
          if (err) {
            log.info('tour2017 - saveBeersPromise - error');
            return reject(err);
          }
          return resolve({
            beerId: inserted.beer_id,
            itemId: inserted.tour_item_id,
          });
        });
      });
    });

    return Promise.all(beerInsertionPromises)
      .then((records) => {
        log.info(`tour2017 - saveBeersPromise - all executed - ${records.length}`);
        resolve({
          rows: records,
          inserted: records.reduce(prev => prev + 1, 0),
          total: records.length,
        });
      });
  });
};

/**
 * Saves any new consumed beers.
 */
const saveConsumedBeersPromise = ({
  beers,
  consumedBeers,
  db,
  userId,
}) => {
  log.info('tour2017 - saveConsumedBeersPromise - start');

  const itemIdMap = {};
  beers.forEach((beer) => {
    itemIdMap[beer.itemId] = beer.beerId;
  });

  const beerInsertionPromises = consumedBeers.map((beer) => {
    return new Promise((resolve, reject) => {
      db.drunken_lizard.consumed_beer.save({
        beer_id: itemIdMap[beer.AccountPt],
        user_account_id: userId,
        tour_added_dtm: moment().format(),
        created_dtm: moment().format(),
        last_accessed_dtm: moment().format(),
      }, (err, inserted) => {
        if (err) {
          log.info('tour2017 - saveConsumedBeersPromise - error');
          return reject(err);
        }
        return resolve({
          consumedBeerId: inserted.consumed_beer_id,
        });
      });
    });
  });

  return Promise.all(beerInsertionPromises)
    .then((records) => {
      log.info(`tour2017 - saveConsumedBeersPromise - all executed - ${records.length}`);
      return {
        rows: records,
        inserted: records.reduce(prev => prev + 1, 0),
        total: records.length,
      };
    });
};

/**
 *
 */
const storeBeersPromise = ({
  beers,
  db,
  userId,
}) => {
  log.info('tour2017 - storeBeersPromise - start');
  return fetchBeerIdsPromise({
    db,
    tourYear: 2017,
    userId,
  })
  .then((beerIds) => {
    return fetchBeersConsumedPromise({
      db,
      tourYear: 2017,
      userId,
    })
    .then((consumedBeerIds) => {
      log.info('tour2017 - storeBeersPromise - aggregation');
      return {
        beerIds,
        consumedBeerIds,
      };
    });
  })
  .then(({ beerIds, consumedBeerIds }) => {
    log.info('tour2017 - storeBeersPromise - insert');
    return new Promise((resolve) => {
      const beerIdsSet = new Set();
      beerIds.forEach(beer => beerIdsSet.add(beer));

      const beerList = beers[1];
      const newBeers = [];
      beerList.forEach((beer) => {
        if (!beerIdsSet.has(beer.ItemID)) {
          newBeers.push(beer);
        }
      });

      log.info(`existing beers - ${beerIdsSet.size}`);
      log.info(`new beers - ${newBeers.length}`);

      const consumedBeerIdsSet = new Set(consumedBeerIds);
      consumedBeerIds.forEach(beer => consumedBeerIdsSet.add(beer));

      const consumedBeers = beers[0];
      const newConsumedBeers = [];
      consumedBeers.forEach((consumedBeer) => {
        if (!consumedBeerIdsSet.has(consumedBeer.AccountPt)) {
          newConsumedBeers.push(consumedBeer);
        }
      });

      log.info(`existing consumed - ${consumedBeerIdsSet.size}`);
      log.info(`new consumed - ${newConsumedBeers.length}`);

      saveBeersPromise({
        beers: newBeers,
        db,
      })
      .then((beerResults) => {
        return saveConsumedBeersPromise({
          beers: beerResults.rows,
          consumedBeers: newConsumedBeers,
          db,
          userId,
        })
        .then((consumedBeerResults) => {
          resolve({
            beerConsumedInserted: consumedBeerResults.inserted,
            beerInserted: beerResults.inserted,
          });
        });
      });
    });
  });
};

const cardHistory = (req, res) => {
  log.info('tour2017 - cardHistory - start');
  fetchApiCredentialPromise({
    db: req.app.get('db'),
    userId: req.params.userId,
  })
  .then(credentials => tour2017Client.fetchCardHistory(credentials))
  .then((beers) => {
    log.info('tour2017 - cardHistory - success');
    res.json(beers);
  })
  .catch((err) => {
    log.info('tour2017 - cardHistory - err');
    res.status(400).json(err);
  });
};

/**
 *
 */
const listBeers = (req, res) => {
  log.info('tour2017 - listBeers - start');
  fetchBeers({
    db: req.app.get('db'),
    tourYear: 2017,
    userId: req.params.userId,
  })
  .then((beers) => {
    log.info('tour2017 - listBeers - success');
    res.json(beers);
  })
  .catch((err) => {
    log.info('tour2017 - listBeers - err');
    res.status(400).json(err);
  });
};

/**
 * Synchronize beers with wiking lizard 2017 webapp and local database.
 */
const synchBeers = (req, res) => {
  log.info('tour2017 - synchBeers - start');
  fetchApiCredentialPromise({
    db: req.app.get('db'),
    userId: req.params.userId,
  })
  .then(credentials => tour2017Client.fetchBeerHistory(credentials))
  .then(beers => storeBeersPromise({
    beers,
    db: req.app.get('db'),
    userId: req.params.userId,
  }))
  .then((updated) => {
    log.info('tour2017 - synchBeers - success');
    res.json(updated);
  })
  .catch((err) => {
    log.info('tour2017 - synchBeers - err');
    res.status(400).json(err);
  });
};

router.route('/:userId/card')
  .all((req, res, next) => {
    // Verify authorization.
    log.trace('verify - jwt');
    next();
  })
  .get(cardHistory);

router.route('/:userId')
  .all((req, res, next) => {
    // Verify authorization.
    log.trace('verify - jwt');
    next();
  })
  .get(listBeers);

router.route('/sync/:userId')
  .all((req, res, next) => {
    // Verify authorization.
    log.trace('verify - jwt');
    next();
  })
  .patch(synchBeers);


export default router;
