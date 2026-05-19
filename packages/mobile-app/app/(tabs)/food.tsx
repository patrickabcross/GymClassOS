// Food tab placeholder — full content lands in plan D2-05.
import { View, Text } from "react-native";

export default function FoodScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 20 }}>Food</Text>
      <Text style={{ color: "#666", marginTop: 8 }}>
        Filled out by plan D2-05
      </Text>
    </View>
  );
}
