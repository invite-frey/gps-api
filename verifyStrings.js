
/**
 * Verify that the provided string is a valid date.
 * 
 * @param {*} dateString The date string
 * 
 * @returns true|false True if the string is a date string.
 */
const verifyDateString = dateString => typeof dateString !== undefined && dateString !== null && !isNaN(new Date(dateString).getTime());

module.exports = {
    verifyUnitId: id => typeof id === 'string' && id.length > 10,
    verifyDateString: verifyDateString,
    verifiedDateStringOrNull: dateString => dateString && verifyDateString(dateString) ? dateString : null
}


