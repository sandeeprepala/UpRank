import express from 'express';
import cors from 'cors';
import 'dotenv/config';
// import pool from "./config/db.js";
// import createUserTable from "./data/createUserTable.js";
// import userRouter from "./routes/userRoute.js";
const app = express();

app.use(cors());
app.use(express.json());

//creating  user table

// createUserTable();

// app.get("/", async (req, res) => {
//   try {
//     const result = await pool.query("SELECT current_database()");
//     const dbName = result.rows[0].current_database;
//     res.send(`The Database name is: ${dbName}`);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error querying the database");
//   }
// });

// mount leaderboard controller
import leaderboardRouter from './controllers/leaderboardController.js';
app.use('/score', leaderboardRouter);

// mount auth controller
import authRouter from './controllers/authController.js';
app.use('/auth', authRouter);

app.get('/', (req, res) => res.send('Leaderboard Service is running'));

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Leaderboard Service listening on ${port}`));
