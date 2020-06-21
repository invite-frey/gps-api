
const dateRange = require('./daterange')
const moment = require('moment')
const {verifyDateString,verifiedDateStringOrNull} = require('./verifyStrings')
const capitalize = string =>  typeof string === 'string' && string.length>0 ? string.charAt(0).toUpperCase() + string.slice(1) : string
const verifyStartMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate < eventDate && (oppositeEventDate === null || messageDate > oppositeEventDate) && messageDate > dateWithSubtractedSeconds(eventDate,30*60)
const verifyEndMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate > eventDate && (oppositeEventDate === null || messageDate < oppositeEventDate) && messageDate < dateWithAddedSeconds(eventDate,30*60)


const isApiEventInRanges = (event,ranges) => {
    
  if( ranges.length === 0 )
      return false;

  const eventStart = moment(event.start)
  const eventEnd = moment(event.end)

  if( !(eventStart.isAfter( ranges[0].start ) && eventEnd.isBefore(ranges[ranges.length-1].end)) ){
      return false;
  }
      
  if( ranges.length === 1)
      return true;

  const midIndex = Math.floor( ranges.length / 2 )
  const midRange = ranges[midIndex-1]

  if( eventEnd.isBefore(midRange.end) )
      return isApiEventInRanges(event,ranges.slice(0,midIndex));

  return isApiEventInRanges(event,ranges.slice(midIndex));
}

const dateWithAddedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() + seconds )
    return newDate;
}
const dateWithSubtractedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() - seconds )
    return newDate;
}

const messageReducer = ({newEvents,remainingMessages}, e, messageType, dateConditionsVerify) => {
  const oppositeMessageType = messageType === "start" ? "end" : "start"
  const prevEvent = newEvents.length > 0 ? newEvents[newEvents.length-1] : null
  const eDateEnd = prevEvent!==null ? new Date(prevEvent[oppositeMessageType]) : null

  const earlierMessages = remainingMessages
    .filter( m =>  dateConditionsVerify(new Date(m.utc),e[messageType],eDateEnd) )

  let nextEvent = {}; nextEvent[`engineRun${capitalize(messageType)}`] = null; nextEvent = {...nextEvent,...e}
  const nextEvents = [...newEvents,nextEvent]
  if( earlierMessages.length>0 ){
      nextEvent[`engineRun${capitalize(messageType)}`] = earlierMessages[earlierMessages.length-1].utc
      remainingMessages = remainingMessages.filter( m =>  m.utc !== nextEvent[`engineRun${capitalize(messageType)}`] )
  }

  return( {newEvents: nextEvents, remainingMessages: remainingMessages.slice()})
}
const startMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"start",verifyStartMessageDateConditions)
const stopMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"end",verifyEndMessageDateConditions)  


const getEvents = (timedata,sqldata,id,timeZone="UTC",start=null,end=null) => {
  start = verifiedDateStringOrNull(start)
  end = verifiedDateStringOrNull(end)

  if( (!start && end) || (start && !end) ){
    throw new Error(`Only received ${start ? `start '${start}'` : `end '${end}'`}. If 'start' or 'end' query parameter is given both must be given.`)
  }
  if( start && end && !(verifyDateString(start) && verifyDateString(end))){
    throw new Error({error: `start '${start}' or end '${end}' invalid format.`})
  }
  
  if(end && end.length < 11){
    const endDate = new Date(end)
    endDate.setDate(endDate.getDate() + 1)
    end = endDate.toISOString()
  }

  const startDate = start ? new Date(start).toISOString() : null
  const endDate = end ? new Date(end).toISOString() : null
  const range = dateRange(startDate,endDate)
  const timeEventsPromise =  timedata.get.events(id,"m",timeZone,range)
  const startMessagesPromise =   sqldata.get.message(id,sqldata.messages.start,range) 
  const stopMessagesPromise =  sqldata.get.message(id,sqldata.messages.stop,range)
  
  return( new Promise( (resolve,reject) => {

    Promise.all([timeEventsPromise,startMessagesPromise,stopMessagesPromise])
      .then( async values => {
        const timeEvents = values[0]
        const startMessages = values[1]
        const stopMessages = values[2]

        let event = {}
        let events = []

        for( key in timeEvents ){
          const tSum = timeEvents[key].sum || 0
          if(tSum>0 && typeof event.start==='undefined'){
              event.start = tSum > 30 ? timeEvents[key].time : dateWithAddedSeconds(timeEvents[key].time,30)
          }else if(tSum<60 && typeof event.start !== 'undefined'){
              event.end = tSum < 30 ? dateWithSubtractedSeconds(timeEvents[key].time,60) : dateWithSubtractedSeconds(timeEvents[key].time,30)
              events.push(event)
              event = {}
          }
        }

        for (const key in events) {
          if (events.hasOwnProperty(key)) {
            const event = events[key];
            try{
              const distanceCalculation = await timedata.get.distance(id,timeZone,{startDate: new Date(event.start).toISOString(), endDate: new Date(event.end).toISOString()})
              console.log(distanceCalculation)
              events[key].distance = distanceCalculation.length > 0 ? distanceCalculation[0].time.distance : 0;
            }catch( e ){
              reject(e)
            }
            
          }
        }

        console.log(events)

        const eventsWithEngineStart = events.reduce(startMessageReducer, {newEvents:[],remainingMessages:[...startMessages]})
        const eventsWithEngineStop = eventsWithEngineStart.newEvents.reverse().reduce(stopMessageReducer, {newEvents:[], remainingMessages:[...stopMessages]})
        const results = {
          range: {
            "start": range.startDate,
            "end": range.endDate
          },
          events: eventsWithEngineStop.newEvents.reverse(),
          unmatchedEngineRunStartMessages: eventsWithEngineStart.remainingMessages,
          unmatchedEngineRunEndMessages: eventsWithEngineStop.remainingMessages
        }

        

        resolve(results);

        // let waypointPromises = []
        // for (const key in results.events) {
        //   if (results.events.hasOwnProperty(key)) {
        //     const event = results.events[key];
        //     const promise = sqldata.get.waypoints(id,{startDate: event.start, endDate: event.end})
        //     waypointPromises.push(promise)
        //   }
        // }

        // Promise.all(waypointPromises)
        //   .then( waypointSets => {
        //     for (const key in waypointSets) {
        //       if (waypointSets.hasOwnProperty(key)) {
        //         const waypointSet = waypointSets[key];
        //         results.events[key].waypoints = waypointSet
        //       }
        //     }
        //     resolve(results);
        //   })
      })

  }))

  
   
  

}

module.exports.get = getEvents
module.exports.isApiEventInRanges = isApiEventInRanges