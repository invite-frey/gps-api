# API Server for Location Data

A small server provider API access to location data collected by some kind of tracking device. The API utilizes both MySQL and InfluxDB data to compile event data from tracking data points.

### Prerequisites

* [NodeJS](https://nodejs.org/en/)
* MySQL and InfluxDB databases containing data collected from a tracker. See the the [gps-server](https://github.com/invite-frey/gps-server.git) for an example of a server collecting tracking data from Xexun trackers.
