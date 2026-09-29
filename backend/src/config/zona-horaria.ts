/**
 * Todo el proceso en UTC.
 *
 * Las fechas de la base son timestamp sin zona, y pg las lee y las escribe
 * en la hora local del proceso. En Render esa hora es UTC; en un equipo en
 * Madrid son dos horas más, y la semilla o una API arrancada en local
 * guardaban las mismas citas dos horas corridas. Se importa lo primero,
 * antes que nada que pueda crear una fecha.
 */
process.env.TZ = 'UTC';
