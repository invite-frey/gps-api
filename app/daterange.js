const defaultTimePeriodMonths = 1

/**
 * Create a date range object from two strings containing dates.
 * 
 * @param {*} startDate String containing ISO formatted date. Start date of range.
 * @param {*} endDate String containing ISO formatted date. End date of range.
 */

const dateRange = (startDate,endDate) => {
    const now = new Date()
    if(!endDate) endDate = now.toISOString();
    if(!startDate) {
        now.setMonth(now.getMonth() - defaultTimePeriodMonths)
        startDate = now.toISOString()
    }

    return {startDate: startDate, endDate: endDate};
}

module.exports = dateRange