const express = require('express')
const influx = require('./influx-database')
const mysql = require('./mysql-database')
const env = require('./env')
const app = express();
const port = process.env.PORT || 1337;

const verifyUnitId = (id) => {
  return typeof id === 'string' && id.length > 10;
}

app.get('/units', async (req, res) => {
  try{
    const units = await influx.getUnits()
    return res.json(units);
    
  }catch(error){
    return res.status(500).send(error.message)
  }
    
});

app.get('/unit/:id', async (req, res) => {
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
    return res.status(500).send(error.message)
  }

});

app.listen(port, () => {
    influx.connect(env.influx)
    mysql.connect(env.mysql)
    console.log(`App listening on port ${port}!`)
  }
);
