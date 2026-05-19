// Schedule tab placeholder — full content lands in plan D2-03.
import { View, Text } from "react-native";

export default function ScheduleScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 20 }}>Schedule</Text>
      <Text style={{ color: "#666", marginTop: 8 }}>
        Filled out by plan D2-03
      </Text>
    </View>
  );
}
