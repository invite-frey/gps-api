const defaultTimePeriodMonths = 1


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