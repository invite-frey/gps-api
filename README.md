# API Server for Location Data

A small server prividing API access to location data collected by some kind of tracking device. The API utilizes both MySQL and InfluxDB data to compile event data from tracking data points. Intended to be used together with [gps-server](https://github.com/invite-frey/gps-server.git), but can be backed by any source as long as the MySQL database has a compatible schema.

### Prerequisites

* [NodeJS](https://nodejs.org/en/)
* MySQL and InfluxDB databases containing data collected from a tracker. See the the [gps-server](https://github.com/invite-frey/gps-server.git) for an example of a server collecting tracking data from Xexun trackers.

### Installation
  
#### Get the files

```
$ git clone https://github.com/invite-frey/gps-api.git
```
Move the gps-server directory to your desired location, for example /var/apps

#### Setup a MySQL Database

Create a MySQL database, if one does not already exist.

The schema is the same used in the [gps-server/db_schema.sql](https://github.com/invite-frey/gps-server/blob/master/db_schema.sql)

```
$ mysql -u youruser -p
mysql> CREATE DATABASE gps;
mysql> GRANT ALL PRIVILEGES ON gps.* to yourdbuser@localhost IDENTIFIED BY 'yoursecretpassword';
mysql> FLUSH PRIVILEGES;
mysql> exit
```

```
$ mysql -u youruser -p gps < db_schema.sql
```

#### If you are using daemontools:

* The service directory is provided as an example.
* Clone the service directory into your desired location (do not link the service directory in the git repo directly to daemontools to prevent confidential information being committed back into your repo).
* Make the required changes to the service/env files and make sure the path to your app installation in the run file is correct.
* Link the cloned service directory to your system's service directory watched by daemontools. 

### Endpoints

```
/units/:id

GET
```
Gets the last recorded information for unit identified by 'id'.

```
/units/:id/events

POST

@param accEvents yes|no Inculde engineStart and engineStop events (slower)
@param distance yes|no Include an approximate distance calculation (integrate speed over time) 

Payload example:

 {"ranges": [
      {"start" : "2019-09-22",
 	    "end" : "2019-09-25"},
 	   {"start" : "2019-10-01",
 	    "end" : "2019-10-23"}
 ]}
```
Gets events for unit identified by 'id'. Expects a POST object in the form of an array containing time ranges to search in. All times are expected to be UTC.

```
/units/:id/events

GET

@param start Start of time range in UTC time. Time should be in format YYYY-DD-MM or full ISO time string.
@param end End tome of range in UTC. Time should be in format YYYY-DD-MM or full ISO time string. If only date is given, the time range will end at the end of that day (before midnight next day).

```
GET request for events for unit identified by 'id'. Returns events one month back in time by default. A different time range can be set by providing the url query parameters.

```
/units/:id/events/:period

GET

@param period Valid periods are: day, hour, minute
```
Get sum of time in minutes for a period.

```
/units/:id/waypoints

GET 

@param start Start of time range in UTC time. Time should be in format YYYY-DD-MM or full ISO time string.
@param end End time of range in UTC. Time should be in format YYYY-DD-MM or full ISO time string. If only date is given, the time range will end at the end of that day (before midnight next day).
```
Get waypoints for a specific time period.

```
/units/:id/waypoints

POST

Payload example:

  {"ranges": [
      {"start" : "2019-09-22",
 	    "end" : "2019-09-25"},
 	   {"start" : "2019-10-01",
 	    "end" : "2019-10-23"}
  ]}
```
Get waypoints for multiple time periods


## Versioning

* 1.0 - First Release

## Authors

* **Frey Mansikkaniemi** - [InviteFrey](https://github.com/invite-frey)

## Donations

Donations are much appreciated if you found this resource useful. 

Bitcoin, Lightning Network and most major credit cards available for donations at [https://frey.hk](https://frey.hk).

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
