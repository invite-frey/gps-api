
const dateRange = require('./daterange')
const moment = require('moment')
const {verifyDateString,verifiedDateStringOrNull} = require('./verifyStrings')
const capitalize = string =>  typeof string === 'string' && string.length>0 ? string.charAt(0).toUpperCase() + string.slice(1) : string
const verifyStartMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate < eventDate && (oppositeEventDate === null || messageDate > oppositeEventDate) && messageDate > dateWithSubtractedSeconds(eventDate,30*60)
const verifyEndMessageDateConditions = (messageDate,eventDate,oppositeEventDate) => messageDate > eventDate && (oppositeEventDate === null || messageDate < oppositeEventDate) && messageDate < dateWithAddedSeconds(eventDate,30*60)

/**
 * Check if event is entirely inside any range in the array of ranges.
 * @param {*} event The event to assess.
 * @param {*} ranges An array of ranges the event should be inside.
 */

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

/**
 * Add some seconds to a date and return a new date.
 * 
 * @param {Date} date The original date.
 * @param {*} seconds Seconds to add.
 * 
 * @returns A new Date object with seconds added to the original date.
 */

const dateWithAddedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() + seconds )
    return newDate;
}

/**
 * Deduct some seconds from a date and return a new date.
 * 
 * @param {Date} date The original date.
 * @param {*} seconds Seconds to deduct.
 * 
 * @returns A new Date object with seconds deducted.
 */

const dateWithSubtractedSeconds = (date,seconds) => {
    const newDate = new Date(date)
    newDate.setSeconds( new Date(date).getSeconds() - seconds )
    return newDate;
}

/**
 * Reducer to match events with start and stop messaages.
 * @param {*} param0 newEvents: the newly created events, remainingMessages
 * @param {*} e The event.
 * @param {string} messageType start|stop  Message type 
 * @param {*} dateConditionsVerify Function to verify date conditions.
 */

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

/**
 * Reducer to match events with start messages.
 * @param {*} nextEventsAndMessages 
 * @param {*} e 
 */
const startMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"start",verifyStartMessageDateConditions)

/**
 * Reducer to match events with stop messages.
 * @param {*} nextEventsAndMessages 
 * @param {*} e 
 */
const stopMessageReducer = (nextEventsAndMessages, e) => messageReducer(nextEventsAndMessages,e,"end",verifyEndMessageDateConditions)  

/**
 * Create events based on movement of tracked object based on both sql data and InfluxDB time based data.
 * 
 * @param {*} timedata InfluxDB interface
 * @param {*} sqldata MySQL interface
 * @param {*} id Id for trackable object
 * @param {*} timeZone Timezone. Standard ISO timezone string.
 * @param {*} start A string representing the date from which to start including events.
 * @param {*} end A string representing the date beyond which not to include events.
 * @param {*} accEvents Include start and stop messages in events.
 * @param {*} distance Include distance traveled in event.
 * 
 * @returns Promise resolving on completion.
 */
const getEvents = (timedata,sqldata,id,timeZone="UTC",start=null,end=null,accEvents,distance) => {
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
  const startMessagesPromise =  accEvents ? sqldata.get.message(id,sqldata.messages.start,range) : []
  const stopMessagesPromise = accEvents ? sqldata.get.message(id,sqldata.messages.stop,range) : []
  
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

        if( distance ){
          for (const key in events) {
            if (events.hasOwnProperty(key)) {
              const event = events[key];
              try{
                events[key].distance = await timedata.get.distance(id,timeZone,{startDate: new Date(event.start).toISOString(), endDate: new Date(event.end).toISOString()})
              }catch( e ){
                reject(e)
              }
              
            }
          }
        }
        

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
      })

  }))

}

module.exports.get = getEvents
module.exports.isApiEventInRanges = isApiEventInRanges