# Databricks notebook source
larvae = spark.table("larvae_filtered_west_coast")
display(larvae)

# COMMAND ----------

from pyspark.sql.functions import col, date_trunc, round, concat_ws

# Add month column
larvae = larvae.withColumn("month", date_trunc("month", col("time")))

# Grid size
GRID = 0.25

# Create grid
larvae = larvae.withColumn("lat_bin", round(col("latitude") / GRID) * GRID)
larvae = larvae.withColumn("lon_bin", round(col("longitude") / GRID) * GRID)

# Create region_id
larvae = larvae.withColumn("region_id", concat_ws("_", "lat_bin", "lon_bin"))

display(larvae)

# COMMAND ----------

from pyspark.sql.functions import avg

larvae_grouped = larvae.groupBy("region_id", "month").agg(
    avg("larvae_count").alias("larvae_density")
)

display(larvae_grouped)

# COMMAND ----------

catch = spark.table("cps_trawl_life_history_nearshore_set_catch_202506")
display(catch)

# COMMAND ----------

from pyspark.sql.functions import col, date_trunc, round, concat_ws

# Use correct time column
catch = catch.withColumn("time", col("datetime_UTC"))

# Convert to month
catch = catch.withColumn("month", date_trunc("month", col("time")))

GRID = 0.25

# Create grid
catch = catch.withColumn("lat_bin", round(col("Latitude") / GRID) * GRID)
catch = catch.withColumn("lon_bin", round(col("Longitude") / GRID) * GRID)

# Region ID
catch = catch.withColumn("region_id", concat_ws("_", "lat_bin", "lon_bin"))

display(catch)

# COMMAND ----------

from pyspark.sql.functions import col, avg, when

# Convert totalNumber to numeric safely
catch = catch.withColumn(
    "totalNumber_clean",
    when(col("totalNumber") == "NA", None).otherwise(col("totalNumber"))
)

# Cast to double
catch = catch.withColumn(
    "totalNumber_clean",
    col("totalNumber_clean").cast("double")
)

# Now aggregate
catch_grouped = catch.groupBy("region_id", "month").agg(
    avg("totalNumber_clean").alias("catch_avg")
)

display(catch_grouped)

# COMMAND ----------

from pyspark.sql.functions import expr

catch_grouped = catch_grouped.withColumn(
    "month", expr("add_months(month, -2)")
)

# COMMAND ----------

merged = larvae_grouped.join(
    catch_grouped,
    ["region_id", "month"]
).dropna()

display(merged)

# COMMAND ----------

larvae_grouped.select("region_id").distinct().count()
catch_grouped.select("region_id").distinct().count()

# COMMAND ----------

larvae_regions = larvae_grouped.select("region_id").distinct()
catch_regions = catch_grouped.select("region_id").distinct()

overlap = larvae_regions.join(catch_regions, "region_id")
overlap.count()

# COMMAND ----------

larvae_grouped.select("month").distinct().orderBy("month").show(20)
catch_grouped.select("month").distinct().orderBy("month").show(20)

# COMMAND ----------

merged = merged.select("region_id", "larvae_density", "catch_avg")
display(merged)

# COMMAND ----------

pdf = merged.toPandas()

# COMMAND ----------

from sklearn.ensemble import RandomForestClassifier

# Create binary target (high vs low catch)
pdf["high_catch"] = (pdf["catch_avg"] > pdf["catch_avg"].median()).astype(int)

# Features
X = pdf[["larvae_density"]]
y = pdf["high_catch"]

# Train model
model = RandomForestClassifier()
model.fit(X, y)

# COMMAND ----------

print(len(pdf))

# COMMAND ----------

latest = pdf.groupby("region_id").tail(1).copy()

latest["pred_prob"] = model.predict_proba(latest[["larvae_density"]])[:,1]

# COMMAND ----------

def label(p):
    if p > 0.7:
        return "high"
    elif p > 0.4:
        return "medium"
    else:
        return "low"

latest["yield"] = latest["pred_prob"].apply(label)

# COMMAND ----------

latest["lat"] = latest["region_id"].apply(lambda x: float(x.split("_")[0]))
latest["lon"] = latest["region_id"].apply(lambda x: float(x.split("_")[1]))

# COMMAND ----------

latest.to_json("predictions.json", orient="records")

# COMMAND ----------

import shutil

shutil.move("predictions.json", "/dbfs/FileStore/predictions.json")

# COMMAND ----------

latest.to_json("predictions.json", orient="records")

dbutils.fs.cp("file:predictions.json", "file:/databricks/driver/predictions.json")
displayHTML("<a href='files/predictions.json' download>Download predictions.json</a>")

# COMMAND ----------

latest.to_json("/databricks/driver/predictions.json", orient="records")

# COMMAND ----------

spark_df = spark.createDataFrame(latest)

# COMMAND ----------

spark_df.coalesce(1).write.mode("overwrite").json("/FileStore/predictions_output")

# COMMAND ----------

import json

json_data = latest.to_dict(orient="records")

print(json.dumps(json_data, indent=2))

# COMMAND ----------

species_grouped = catch.groupBy("region_id", "scientificName").count()

# COMMAND ----------

from pyspark.sql.window import Window
from pyspark.sql.functions import row_number, desc

window = Window.partitionBy("region_id").orderBy(desc("count"))

top_species = species_grouped.withColumn("rank", row_number().over(window)) \
                             .filter(col("rank") <= 3)

# COMMAND ----------

larvae_time = larvae.groupBy("region_id", "month").agg(
    avg("larvae_count").alias("larvae_density")
)

# COMMAND ----------

larvae_pdf = larvae_time.toPandas()

# COMMAND ----------

peak_months = larvae_pdf.sort_values("larvae_density", ascending=False) \
                        .groupby("region_id") \
                        .head(2)

# COMMAND ----------

def add_lag(month):
    return month + 2   # months

# COMMAND ----------

import pandas as pd

peak_months["optimal_month"] = peak_months["month"] + pd.DateOffset(months=2)

# COMMAND ----------

peak_months["optimal_month_str"] = peak_months["optimal_month"].dt.strftime("%B")

# COMMAND ----------

species_pdf = top_species.toPandas()

# COMMAND ----------

species_grouped = species_pdf.groupby("region_id")["scientificName"].apply(list).reset_index()

# COMMAND ----------

peak_months = peak_months[["region_id", "optimal_month_str"]]

# COMMAND ----------

peak_months = peak_months.rename(columns={"optimal_month_str": "best_month"})

# COMMAND ----------

combined = species_grouped.merge(peak_months, on="region_id", how="left")

# COMMAND ----------

final_df = latest.merge(combined, on="region_id", how="left")

# COMMAND ----------

final_df = final_df.rename(columns={
    "scientificName": "species",
    "pred_prob": "confidence"
})

# COMMAND ----------

final_df = final_df[[
    "lat",
    "lon",
    "yield",
    "confidence",
    "species",
    "best_month"
]]

# COMMAND ----------

import json

print(json.dumps(final_df.to_dict(orient="records"), indent=2))

# COMMAND ----------

from pyspark.sql.functions import avg

larvae_time = larvae.groupBy("region_id", "month").agg(
    avg("larvae_count").alias("larvae_density")
)

display(larvae_time)

# COMMAND ----------

larvae_pdf = larvae_time.toPandas()

# COMMAND ----------

larvae = spark.table("larvae_filtered_west_coast")
display(larvae)

# COMMAND ----------

from pyspark.sql.functions import avg

larvae_time = larvae.groupBy("region_id", "month").agg(
    avg("larvae_count").alias("larvae_density")
)

# COMMAND ----------

larvae_pdf = larvae_time.toPandas()

# COMMAND ----------

display(larvae)

# COMMAND ----------

display(larvae_grouped)
print(larvae_grouped.count())

# COMMAND ----------

display(catch_grouped)
print(catch_grouped.count())

# COMMAND ----------

display(merged)
print(merged.count())

# COMMAND ----------

from pyspark.sql.functions import floor, col, concat_ws

GRID = 0.5

larvae = larvae.withColumn("lat_bin", floor(col("latitude") / GRID) * GRID)
larvae = larvae.withColumn("lon_bin", floor(col("longitude") / GRID) * GRID)

larvae = larvae.withColumn(
    "region_id",
    concat_ws("_", col("lat_bin"), col("lon_bin"))
)

# COMMAND ----------

catch = catch.withColumn("lat_bin", floor(col("Latitude") / GRID) * GRID)
catch = catch.withColumn("lon_bin", floor(col("Longitude") / GRID) * GRID)

catch = catch.withColumn(
    "region_id",
    concat_ws("_", col("lat_bin"), col("lon_bin"))
)

# COMMAND ----------

from pyspark.sql.functions import avg, date_trunc

larvae = larvae.withColumn("month", date_trunc("month", col("time")))

larvae_grouped = larvae.groupBy("region_id").agg(
    avg("larvae_count").alias("larvae_density")
)

# COMMAND ----------

from pyspark.sql.functions import expr

catch = catch.withColumn("month", date_trunc("month", col("datetime_UTC")))

catch = catch.withColumn(
    "totalNumber_clean",
    expr("try_cast(totalNumber as double)")
)

catch_grouped = catch.groupBy("region_id").agg(
    avg("totalNumber_clean").alias("catch_avg")
)

# COMMAND ----------

larvae_regions = larvae_grouped.select("region_id").distinct()
catch_regions = catch_grouped.select("region_id").distinct()

overlap = larvae_regions.join(catch_regions, "region_id")

print("Overlap count:", overlap.count())

# COMMAND ----------

merged = larvae_grouped.join(
    catch_grouped,
    "region_id"
)

print("Merged rows:", merged.count())
display(merged)

# COMMAND ----------

pdf = merged.toPandas()

# COMMAND ----------

pdf = pdf.dropna(subset=["larvae_density", "catch_avg"])

# COMMAND ----------

print(len(pdf))

# COMMAND ----------

pdf["high_catch"] = (pdf["catch_avg"] > pdf["catch_avg"].median()).astype(int)

# COMMAND ----------

X = pdf[["larvae_density"]]
y = pdf["high_catch"]

# COMMAND ----------

from sklearn.ensemble import RandomForestClassifier

model = RandomForestClassifier()
model.fit(X, y)

# COMMAND ----------

latest = pdf.groupby("region_id").tail(1).copy()

latest["pred_prob"] = model.predict_proba(latest[["larvae_density"]])[:,1]

# COMMAND ----------

def label(p):
    if p > 0.6:
        return "high"
    elif p > 0.3:
        return "medium"
    else:
        return "low"

latest["yield"] = latest["pred_prob"].apply(label)

# COMMAND ----------

latest["lat"] = latest["region_id"].apply(lambda x: float(x.split("_")[0]))
latest["lon"] = latest["region_id"].apply(lambda x: float(x.split("_")[1]))

# COMMAND ----------

from pyspark.sql.functions import avg, date_trunc, col

larvae = larvae.withColumn("month", date_trunc("month", col("time")))

larvae_time = larvae.groupBy("region_id", "month").agg(
    avg("larvae_count").alias("larvae_density")
)

# COMMAND ----------

larvae_pdf = larvae_time.toPandas()

# COMMAND ----------

larvae_pdf["seasonal_score"] = larvae_pdf.groupby("region_id")["larvae_density"] \
                                         .transform(lambda x: x / x.max())

# COMMAND ----------

import pandas as pd

larvae_pdf["fish_month"] = larvae_pdf["month"] + pd.DateOffset(months=2)

# COMMAND ----------

larvae_pdf["fish_month_str"] = larvae_pdf["fish_month"].dt.strftime("%B")

# COMMAND ----------

species_pdf = top_species.toPandas()

# COMMAND ----------

from pyspark.sql.functions import col

species_grouped_spark = catch.groupBy("region_id", "scientificName").count()

# COMMAND ----------

from pyspark.sql.window import Window
from pyspark.sql.functions import row_number, desc

window = Window.partitionBy("region_id").orderBy(desc("count"))

top_species = species_grouped_spark.withColumn("rank", row_number().over(window)) \
                                   .filter(col("rank") <= 3)

# COMMAND ----------

species_pdf = top_species.toPandas()

# COMMAND ----------

print(species_pdf.head())

# COMMAND ----------

species_grouped = species_pdf.groupby("region_id")["scientificName"].apply(list).reset_index()

# COMMAND ----------

print(type(final_df))
print(type(latest))
print(type(species_grouped))

# COMMAND ----------

# force strings
final_df["region_id"] = final_df["region_id"].astype(str)
latest["region_id"] = latest["region_id"].astype(str)
species_grouped["region_id"] = species_grouped["region_id"].astype(str)

# safe normalize
def normalize_region(x):
    try:
        lat, lon = x.split("_")
        return f"{round(float(lat),2)}_{round(float(lon),2)}"
    except:
        return x

final_df["region_id"] = final_df["region_id"].apply(normalize_region)
latest["region_id"] = latest["region_id"].apply(normalize_region)
species_grouped["region_id"] = species_grouped["region_id"].apply(normalize_region)

# COMMAND ----------

final_df = final_df.merge(species_grouped, on="region_id", how="inner")

final_df = final_df.merge(
    latest[["region_id", "yield", "pred_prob", "lat", "lon"]],
    on="region_id",
    how="inner"
)

# COMMAND ----------

print(final_df.isna().sum())

# COMMAND ----------

print(final_df.head())

# COMMAND ----------

import json

with open("intelligence.json", "w") as f:
    json.dump(final_df.to_dict(orient="records"), f, indent=2)

# COMMAND ----------

import json
print(json.dumps(final_df.to_dict(orient="records"), indent=2))

# COMMAND ----------

clean_df = final_df[[
    "region_id",
    "lat",
    "lon",
    "species",
    "fish_month_str",
    "seasonal_score",
    "yield",
    "confidence"
]]

# COMMAND ----------

print(clean_df.columns)

# COMMAND ----------

import json
print(json.dumps(clean_df.to_dict(orient="records"), indent=2))