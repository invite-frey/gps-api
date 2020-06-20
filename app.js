const express = require('express')
const bodyParser = require('body-parser')
const influx = require('./influx-database')
const mysql = require('./mysql-database')
const env = require('./env')
const app = express()
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')
const apiKeyMiddleware = require('./apikey.middleware')
const port = process.env.PORT || 1337;
const {verifyUnitId} = require('./verifyStrings')
const events = require('./events')
const getEvents = (id,timeZone="UTC",start=null,end=null) => events.get(influx,mysql,id,timeZone,start,end) 


/**
 * Setup request logging
 */
app.use(morgan("common"))

/**
 * Add support for POST endpoints
 */
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

/**
 * Activate CORS
 */
app.use(cors())

/**
 * Use Helmet for basic protection
 */

app.use(helmet())

/**
 * Require API Key for all access
 */

app.use(apiKeyMiddleware.apiKeyNeeded)

/**
 * Endpoint: Get a list of units.
 */
// app.get('/units', async (req, res) => {
//   try{
//     const units = await influx.get.units()
//     return res.json(units);
    
//   }catch(error){
//     return res.status(500).send(error.message)
//   }
    
// });

/**
 * Endpoint: gets the last recorded information for unit identified by 'id'
 */
app.get('/units/:id', async (req, res) => {
  try{
    const id = req.params.id
    if(verifyUnitId(id)){
      const unitData = await mysql.get.unit(id)
      if(unitData.length===1){
        return res.json(unitData[0])
      }else{
        return res.status(400).send(new Error("Ambiguous unit id."))
      }
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    console.log(error)
    return res.status(500).send(error.message)
  }
});

/**
 * Endpoint: Gets events for unit identified by 'id'. Expects a POST object in the form of an array containing time ranges to search in.
 * All times are expected to be UTC.
 * 
 * Example of POST json object:
 * 
 * {"ranges": [
 *     {"start" : "2019-09-22",
 *	    "end" : "2019-09-25"},
 *	   {"start" : "2019-10-01",
 *	    "end" : "2019-10-23"}
 * ]}
 * 
 * @param accEvents 'yes' to inculde engineStart and engineStop events (slower)
 * @param distance 'no': default, 'exact': perform a geometric distance calculation (slower), 'approx': perform approximate distance calculation based on integrating speed over time (faster) 
 */
app.post('/units/:id/events', async (req,res) => {
  try{
    const {id} = req.params
    const {ranges} = req.body
   

    if( !Array.isArray(ranges) ){
      return res.status(400).send({error: "POST path needs a set of ranges."})
    }

    if(!verifyUnitId(id)){
      return res.status(400).send({error: "Invalid id."})
    }
    
    const promises = ranges.map( async (range) => {
      const {start,end} = range
      try{
        return await getEvents(id,"UTC", start, end);;
       
      }catch(error){
        console.log(error)
        return res.status(500).send(error.message)
      }      
    }) 

    return res.json(await Promise.all(promises))
    
  }catch(error){
    return res.status(500).send(error.stack)
  }
})

/**
 * Endpoint: GET request for events for unit identified by 'id'. Returns events one month back in time by default.
 * A different time range can be set by providing the following url query parameters:
 * 
 * @param start Start of time range in UTC time. Time should be in format YYYY-DD-MM or full ISO time string.
 * @param end End tome of range in UTC. Time should be in format YYYY-DD-MM or full ISO time string. If only date is given, the time range will end at the end of that day (before midnight next day).
 */
app.get('/units/:id/events', async (req,res) => {  
  const {id} = req.params
  const {start,end,accEvents,distance='no'} = req.query

  try{
    const results = await getEvents(id,"UTC",start,end,accEvents)
    return res.json(results)
    
  }catch(error){
    return res.status(400).send(error.message)
  }
})

/**
 * Endpoint: Get sum of time in minutes for a period.
 * 
 * @param period Valid periods are: day, hour, minute
 * @returns Json object containing array of objects containing:  
 * {
 *   "time": "2019-09-24T00:00:00.000Z",
 *   "sum": null || total minutes
 * },
 */
app.get('/units/:id/events/:period', async (req,res) => {
  
  try{
    const {id,period} = req.params
    let decodedPeriod = ""
    switch(period){
      case "day":
        decodedPeriod = "d"
        break;
      case "hour":
        decodedPeriod = "h"
        break;
      case "minute":
        decodedPeriod = "m"
        break
      default:
        return res.status(400).send("Invalid time period.");
    }
    if(verifyUnitId(id)){
      const events = await influx.get.events(id,decodedPeriod)
      return res.json(events)
    }else{
      return res.status(400).send(new Error("Invalid id."))
    }
  }catch(error){
    return res.status(500).send(error.stack)
  }
})

/**
 * Endpoint: Get waypoints for a specific time period.
 *  
 * @param start Start of time range in UTC time. Time should be in format YYYY-DD-MM or full ISO time string.
 * @param end End tome of range in UTC. Time should be in format YYYY-DD-MM or full ISO time string. If only date is given, the time range will end at the end of that day (before midnight next day).
 */

app.get('/units/:id/waypoints', async (req,res) => {  
  const {id} = req.params
  const {start,end} = req.query

  if(verifyUnitId(id)){
    if(typeof start !== 'undefined' && typeof end !== 'undefined'){
      const waypoints = await mysql.get.waypoints(id,{startDate: start, endDate: end})
      return res.json(waypoints);
    }else{
      return res.status(400).send(new Error("Start and/or end parameters missing."));
    }

  }else{
    return res.status(400).send(new Error("Invalid id."));
  }
})

/**
 * Endpoint: Get waypoints for multiple time periods
 * 
 *  * Example of POST json object:
 * 
 * {"ranges": [
 *     {"start" : "2019-09-22",
 *	    "end" : "2019-09-25"},
 *	   {"start" : "2019-10-01",
 *	    "end" : "2019-10-23"}
 * ]}
 */

app.post('/units/:id/waypoints', async (req,res) => {  
  const {id} = req.params
  const {ranges} = req.body

  if(verifyUnitId(id)){
    if(typeof ranges !== 'undefined'){
     
      const promises = ranges.map( async (range) => {
        const {start,end} = range
        try{
          return await mysql.get.waypoints(id,{startDate: start, endDate: end})
         
        }catch(error){
          console.log(error)
          return res.status(500).send(error.message)
        }      
      }) 
      return res.json(Promise.all(promises));
    }else{
      return res.status(400).send(new Error("Start and/or end parameters missing."));
    }

  }else{
    return res.status(400).send(new Error("Invalid id."));
  }
})


/**
 * Start app.
 */
app.listen(port, () => {
    influx.connect(env.influx)
    mysql.connect(env.mysql)
    console.log(`App listening on port ${port}!`)
  }
);
