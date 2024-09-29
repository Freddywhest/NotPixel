var _ = require("lodash");
function taskFilter(tasks, query_name) {
  if (_.isEmpty(tasks)) return [];
  return tasks.filter((task) => {
    if (typeof query_name == "string") {
      return (
        task.type.toLowerCase() === query_name.toLowerCase() &&
        task?.is_completed == false
      );
    } else if (Array.isArray(query_name)) {
      return (
        query_name.includes(task.type.toLowerCase()) &&
        task?.is_completed == false
      );
    } else {
      return [];
    }
  });
}

module.exports = taskFilter;
